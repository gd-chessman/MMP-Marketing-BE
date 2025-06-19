import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositWithdraw, TransactionType, WithdrawalStatus } from './deposit-withdraw.entity';
import { CreateDepositWithdrawDto } from './dto/create-deposit-withdraw.dto';
import { Wallet } from '../wallets/wallet.entity';
import { PublicKey, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DepositWithdrawService {
  private readonly logger = new Logger(DepositWithdrawService.name);
  private readonly connection: Connection;
  private readonly TRANSACTION_FEE = 0.000005; // Transaction fee in SOL
  private readonly MMP_MINT: string;
  private readonly MPB_MINT: string;
  private readonly USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  private readonly WITHDRAWAL_FEE_USD = 0.5; // $1
  private readonly SOL_PRICE_USD = 146.0; // $146
  private readonly DESTINATION_WALLET: string; // Ví sàn để nhận phí

  constructor(
    @InjectRepository(DepositWithdraw)
    private readonly depositWithdrawRepository: Repository<DepositWithdraw>,
    private readonly configService: ConfigService,
  ) {
    // Bạn cần truyền SOLANA_RPC_URL qua biến môi trường hoặc config
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL is not set');
    }
    this.connection = new Connection(rpcUrl);
    this.MMP_MINT = this.configService.get<string>('MMP_MINT') || '';
    this.MPB_MINT = this.configService.get<string>('MPB_MINT') || '';
    this.DESTINATION_WALLET = this.configService.get<string>('DESTINATION_WALLET') || '';
  }

  async createDepositWithdraw(dto: CreateDepositWithdrawDto, wallet: Wallet) {
    try {
      // Lấy thông tin ví từ database
      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      // Validate địa chỉ ví nhận
      let fromPublicKey: PublicKey;
      let fromKeypair: Keypair;
      let toPublicKey: PublicKey;
      try {
        toPublicKey = new PublicKey(dto.to_address);
        fromPublicKey = new PublicKey(wallet.sol_address);
        if (!wallet.private_key) {
          throw new BadRequestException('Wallet private key not found');
        }
        fromKeypair = Keypair.fromSecretKey(bs58.decode(wallet.private_key));
        if (fromPublicKey.toString() === toPublicKey.toString()) {
          throw new BadRequestException('Sender and receiver wallet addresses must be different');
        }
      } catch (error) {
        this.logger.error(`Error creating deposit/withdraw 1: ${error.message}`);
        throw new BadRequestException('Invalid Solana wallet address');
      }

      // Tạo bản ghi giao dịch
      const transaction = this.depositWithdrawRepository.create({
        wallet_id: wallet.id,
        from_address: wallet.sol_address,
        to_address: dto.to_address,
        type: dto.type as TransactionType,
        amount: dto.amount,
        symbol: dto.symbol,
        status: WithdrawalStatus.PENDING,
      });
      await this.depositWithdrawRepository.save(transaction);

      if (dto.type === TransactionType.WITHDRAW) {
        // Tất cả giao dịch rút SOL, USDT, USDC đều tính phí $1
        switch (dto.symbol) {
          case 'SOL':
            await this.processWithdrawalSOLWithFee(transaction, fromKeypair);
            break;
          case 'USDT':
          case 'USDC':
            await this.processWithdrawalSPLWithFee(transaction, fromKeypair, dto.symbol);
            break;
          case 'MMP':
          case 'MPB':
            // Token nội bộ không tính phí
            await this.processWithdrawalSPL(transaction, fromKeypair, dto.symbol);
            break;
          default:
            throw new BadRequestException('Unsupported token symbol');
        }
      }

      return transaction;
    } catch (error) {
      this.logger.error(`Error creating deposit/withdraw 2: ${error.message}`);
      throw new BadRequestException(`${error.message}`);
    }
  }

  private async processWithdrawalSOL(transaction: DepositWithdraw, fromKeypair: Keypair) {
    try {
      // Kiểm tra số dư ví
      const balance = await this.connection.getBalance(fromKeypair.publicKey);
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      const requiredAmount = Number(transaction.amount) + this.TRANSACTION_FEE;
      if (balanceInSol < requiredAmount) {
        const adjustedAmount = balanceInSol - this.TRANSACTION_FEE;
        if (adjustedAmount <= 0) {
          throw new BadRequestException('Insufficient SOL balance');
        }
        transaction.amount = adjustedAmount;
      }
      // Tạo lệnh chuyển tiền
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(transaction.to_address),
        lamports: Math.floor(Number(transaction.amount) * LAMPORTS_PER_SOL),
      });
      const tx = new Transaction().add(transferInstruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [fromKeypair],
      );
      transaction.status = WithdrawalStatus.COMPLETED;
      transaction.tx_hash = signature;
      await this.depositWithdrawRepository.save(transaction);
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      transaction.status = WithdrawalStatus.FAILED;
      transaction.tx_hash = null;
      await this.depositWithdrawRepository.save(transaction);
      throw new BadRequestException(`${error.message}`);
    }
  }

  private async processWithdrawalSPL(transaction: DepositWithdraw, fromKeypair: Keypair, symbol: string) {
    try {
      // Lấy mint address từ thuộc tính class
      let mintAddress: string | undefined;
      switch (symbol) {
        case 'MMP':
          mintAddress = this.MMP_MINT;
          break;
        case 'MPB':
          mintAddress = this.MPB_MINT;
          break;
        default:
          throw new BadRequestException('Unsupported token symbol');
      }
      if (!mintAddress) {
        throw new BadRequestException('Token mint address not configured');
      }
      const mint = new PublicKey(mintAddress);
      // Lấy associated token account của người gửi
      const fromTokenAccount = await getAssociatedTokenAddress(mint, fromKeypair.publicKey);
      // Lấy associated token account của người nhận
      const toTokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(transaction.to_address));
      // Kiểm tra số dư token
      const fromTokenAccountInfo = await this.connection.getTokenAccountBalance(fromTokenAccount);
      const decimals = fromTokenAccountInfo.value.decimals;
      const balance = Number(fromTokenAccountInfo.value.uiAmount);
      if (balance < Number(transaction.amount)) {
        throw new BadRequestException('Insufficient token balance');
      }
      // Kiểm tra và tạo ATA cho người nhận nếu chưa có
      const toTokenAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
      const tx = new Transaction();
      if (!toTokenAccountInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            fromKeypair.publicKey,
            toTokenAccount,
            new PublicKey(transaction.to_address),
            mint
          )
        );
      }
      // Thêm instruction chuyển token
      tx.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          fromKeypair.publicKey,
          Math.floor(Number(transaction.amount) * Math.pow(10, decimals)),
          [],
          TOKEN_PROGRAM_ID
        )
      );
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [fromKeypair],
      );
      transaction.status = WithdrawalStatus.COMPLETED;
      transaction.tx_hash = signature;
      await this.depositWithdrawRepository.save(transaction);
    } catch (error) {
      transaction.status = WithdrawalStatus.FAILED;
      transaction.tx_hash = null;
      await this.depositWithdrawRepository.save(transaction);
      const errorMessage = error.message || '';
      if (errorMessage.includes('Simulation failed')) {
        if (errorMessage.includes('insufficient lamports')) {
          throw new BadRequestException('ATA creation fee is 0.0025 SOL');
        }
        if (errorMessage.includes('insufficient funds for rent')) {
          throw new BadRequestException('ATA creation fee is 0.0025 SOL');
        }
        if (errorMessage.includes('Attempt to debit an account but found no record of a prior credit')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
      }
      throw new BadRequestException(`${errorMessage}`);
    }
  }

  /**
   * Xử lý rút SOL với phí $1
   */
  private async processWithdrawalSOLWithFee(transaction: DepositWithdraw, fromKeypair: Keypair) {
    try {
      // Tính phí $1 chuyển về SOL
      const feeInSol = this.WITHDRAWAL_FEE_USD / this.SOL_PRICE_USD; // $1 / $146 = 0.00685 SOL
      
      // Kiểm tra số dư ví
      const balance = await this.connection.getBalance(fromKeypair.publicKey);
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      const totalRequired = Number(transaction.amount) + feeInSol + this.TRANSACTION_FEE;
      
      if (balanceInSol < totalRequired) {
        throw new BadRequestException(`Insufficient SOL balance. Required: ${totalRequired} SOL (including fee), Available: ${balanceInSol} SOL`);
      }

      // Tạo transaction với 2 instruction:
      // 1. Chuyển phí vào ví sàn
      // 2. Chuyển số tiền chính cho user
      const tx = new Transaction();

      // Instruction 1: Chuyển phí vào ví sàn
      const feeInstruction = SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(this.DESTINATION_WALLET),
        lamports: Math.floor(feeInSol * LAMPORTS_PER_SOL),
      });
      tx.add(feeInstruction);

      // Instruction 2: Chuyển số tiền chính cho user
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(transaction.to_address),
        lamports: Math.floor(Number(transaction.amount) * LAMPORTS_PER_SOL),
      });
      tx.add(transferInstruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [fromKeypair],
      );
      
      transaction.status = WithdrawalStatus.COMPLETED;
      transaction.tx_hash = signature;
      transaction.fee_usd = this.WITHDRAWAL_FEE_USD;

      await this.depositWithdrawRepository.save(transaction);
      
      this.logger.log(`SOL withdrawal with fee completed. Amount: ${transaction.amount} SOL, Fee: ${feeInSol} SOL ($${this.WITHDRAWAL_FEE_USD}) to exchange, TX: ${signature}`);
      
    } catch (error) {
      this.logger.error(`Error processing SOL withdrawal with fee: ${error.message}`);
      transaction.status = WithdrawalStatus.FAILED;
      transaction.tx_hash = null;
      await this.depositWithdrawRepository.save(transaction);
      throw new BadRequestException(`${error.message}`);
    }
  }

  /**
   * Xử lý rút SPL token với phí $1
   */
  private async processWithdrawalSPLWithFee(transaction: DepositWithdraw, fromKeypair: Keypair, symbol: string) {
    try {
      // Lấy mint address
      let mintAddress: string;
      switch (symbol) {
        case 'USDT':
          mintAddress = this.USDT_MINT;
          break;
        case 'USDC':
          mintAddress = this.USDC_MINT;
          break;
        default:
          throw new BadRequestException('Unsupported token symbol for withdrawal with fee');
      }

      const mint = new PublicKey(mintAddress);
      
      // Lấy associated token account của người gửi
      const fromTokenAccount = await getAssociatedTokenAddress(mint, fromKeypair.publicKey);
      
      // Lấy associated token account của người nhận
      const toTokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(transaction.to_address));
      
      // Lấy associated token account của ví sàn (để nhận phí)
      const exchangeTokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(this.DESTINATION_WALLET));
      
      // Kiểm tra số dư token
      const fromTokenAccountInfo = await this.connection.getTokenAccountBalance(fromTokenAccount);
      const decimals = fromTokenAccountInfo.value.decimals;
      const balance = Number(fromTokenAccountInfo.value.uiAmount);
      
      // Tổng số token cần: số tiền chính + phí $1
      const totalRequired = Number(transaction.amount) + this.WITHDRAWAL_FEE_USD;
      
      if (balance < totalRequired) {
        throw new BadRequestException(`Insufficient ${symbol} balance. Required: ${totalRequired} ${symbol} (including fee), Available: ${balance} ${symbol}`);
      }

      // Tạo transaction với nhiều instruction
      const tx = new Transaction();

      // Kiểm tra và tạo ATA cho người nhận nếu chưa có
      const toTokenAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
      if (!toTokenAccountInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            fromKeypair.publicKey,
            toTokenAccount,
            new PublicKey(transaction.to_address),
            mint
          )
        );
      }

      // Kiểm tra và tạo ATA cho ví sàn nếu chưa có
      const exchangeTokenAccountInfo = await this.connection.getAccountInfo(exchangeTokenAccount);
      if (!exchangeTokenAccountInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            fromKeypair.publicKey,
            exchangeTokenAccount,
            new PublicKey(this.DESTINATION_WALLET),
            mint
          )
        );
      }

      // Instruction 1: Chuyển phí $1 vào ví sàn
      tx.add(
        createTransferInstruction(
          fromTokenAccount,
          exchangeTokenAccount,
          fromKeypair.publicKey,
          Math.floor(this.WITHDRAWAL_FEE_USD * Math.pow(10, decimals)),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // Instruction 2: Chuyển số tiền chính cho user
      tx.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          fromKeypair.publicKey,
          Math.floor(Number(transaction.amount) * Math.pow(10, decimals)),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [fromKeypair],
      );

      transaction.status = WithdrawalStatus.COMPLETED;
      transaction.tx_hash = signature;
      transaction.fee_usd = this.WITHDRAWAL_FEE_USD;
      
      await this.depositWithdrawRepository.save(transaction);
      
      this.logger.log(`${symbol} withdrawal with fee completed. Amount: ${transaction.amount} ${symbol}, Fee: ${this.WITHDRAWAL_FEE_USD} ${symbol} ($${this.WITHDRAWAL_FEE_USD}) to exchange, TX: ${signature}`);
      
    } catch (error) {
      this.logger.error(`Error processing ${symbol} withdrawal with fee: ${error.message}`);
      transaction.status = WithdrawalStatus.FAILED;
      transaction.tx_hash = null;
      await this.depositWithdrawRepository.save(transaction);
      throw new BadRequestException(`${error.message}`);
    }
  }

  async findByWalletAddress(wallet_address: string): Promise<DepositWithdraw[]> {
    return this.depositWithdrawRepository.find({
      where: [
        { from_address: wallet_address, status: WithdrawalStatus.COMPLETED },
        { to_address: wallet_address, status: WithdrawalStatus.COMPLETED }
      ],
      order: { created_at: 'DESC' }
    });
  }
} 