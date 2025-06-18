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
        this.logger.error(`Error creating deposit/withdraw: ${error.message}`);
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
        switch (dto.symbol) {
          case 'SOL':
            await this.processWithdrawal(transaction, fromKeypair);
            break;
          case 'MMP':
          case 'MPB':
            await this.processWithdrawalSPL(transaction, fromKeypair, dto.symbol);
            break;
          default:
            throw new BadRequestException('Unsupported token symbol');
        }
      }

      return transaction;
    } catch (error) {
      this.logger.error(`Error creating deposit/withdraw: ${error.message}`);
      throw error;
    }
  }

  private async processWithdrawal(transaction: DepositWithdraw, fromKeypair: Keypair) {
    try {
      // Kiểm tra số dư ví
      const balance = await this.connection.getBalance(fromKeypair.publicKey);
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      const requiredAmount = Number(transaction.amount) + this.TRANSACTION_FEE;
      if (balanceInSol < requiredAmount) {
        const adjustedAmount = balanceInSol - this.TRANSACTION_FEE;
        if (adjustedAmount <= 0) {
          throw new BadRequestException('Insufficient wallet balance for transaction fee');
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
      throw new BadRequestException(`Transfer failed: ${error.message}`);
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
          throw new BadRequestException('Insufficient SOL balance');
        }
      }
      throw new BadRequestException(`Transfer failed: ${errorMessage}`);
    }
  }

  async findByWalletId(walletId: number): Promise<DepositWithdraw[]> {
    return this.depositWithdrawRepository.find({
      where: { wallet_id: walletId },
      order: { created_at: 'DESC' }
    });
  }
} 