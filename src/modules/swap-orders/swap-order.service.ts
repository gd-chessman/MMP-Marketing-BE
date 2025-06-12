import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, SystemProgram } from '@solana/web3.js';
import { SwapOrder, TokenType, SwapOrderStatus } from './swap-order.entity';
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { TOKEN_PROGRAM_ID, getMint, createMintToInstruction, createTransferInstruction } from '@solana/spl-token';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly connection: Connection;

  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    private configService: ConfigService,
  ) {
    this.connection = new Connection(this.configService.get('SOLANA_RPC_URL'));
  }

  async create(wallet: any, dto: CreateSwapOrderDto): Promise<SwapOrder> {
    try {
      // 1. Validate input
      if (dto.input_amount <= 0) {
        throw new BadRequestException('Input amount must be greater than 0');
      }

      // 2. Kiểm tra số dư
      let hasBalance = false;
      try {
        if (dto.input_token === TokenType.SOL) {
          const balance = await this.connection.getBalance(new PublicKey(wallet.sol_address));
          hasBalance = balance >= dto.input_amount;
        } else {
          const mintAddress = this.configService.get(`${dto.input_token}_MINT`);
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            new PublicKey(wallet.sol_address),
            { mint: new PublicKey(mintAddress) }
          );
          
          if (tokenAccounts.value.length > 0) {
            const tokenBalance = await this.connection.getTokenAccountBalance(
              tokenAccounts.value[0].pubkey
            );
            hasBalance = tokenBalance.value.uiAmount >= dto.input_amount;
          }
        }
      } catch (error) {
        this.logger.error(`Error checking balance: ${error.message}`);
        throw new BadRequestException('Failed to check balance');
      }

      if (!hasBalance) {
        throw new BadRequestException('Insufficient balance');
      }

      // 3. Tính toán số lượng MMP token và tỷ lệ swap
      const IDO_PRICE = 0.0001; // $0.0001 per token
      const tokenPrices = {
        [TokenType.SOL]: 100, // $100 per SOL
        [TokenType.USDT]: 1,  // $1 per USDT
        [TokenType.USDC]: 1,  // $1 per USDC
      };
      const inputPrice = tokenPrices[dto.input_token];
      const mmpAmount = Math.floor((dto.input_amount * inputPrice) / IDO_PRICE);

      // 4. Tạo và lưu swap order
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: wallet.id,
        input_token: dto.input_token,
        input_amount: dto.input_amount,
        mmp_received: mmpAmount,
        swap_rate: inputPrice,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 5. Bắt đầu lắng nghe giao dịch
      try {
        const walletAccount = await this.connection.getAccountInfo(
          new PublicKey(savedOrder.wallet.sol_address)
        );

        if (!walletAccount) {
          throw new NotFoundException('Wallet not found');
        }

        this.connection.onAccountChange(
          new PublicKey(savedOrder.wallet.sol_address),
          async (accountInfo) => {
            try {
              let balance = 0;
              if (savedOrder.input_token === TokenType.SOL) {
                balance = accountInfo.lamports;
              } else {
                const mintAddress = this.configService.get(`${savedOrder.input_token}_MINT`);
                const tokenAccounts = await this.connection.getTokenAccountsByOwner(
                  new PublicKey(savedOrder.wallet.sol_address),
                  { mint: new PublicKey(mintAddress) }
                );
                
                if (tokenAccounts.value.length > 0) {
                  const tokenBalance = await this.connection.getTokenAccountBalance(
                    tokenAccounts.value[0].pubkey
                  );
                  balance = tokenBalance.value.uiAmount;
                }
              }

              const expectedAmount = savedOrder.input_amount * savedOrder.swap_rate;

              if (balance >= expectedAmount) {
                try {
                  const mmpMint = new PublicKey(this.configService.get('MMP_MINT'));
                  const transaction = new Transaction();

                  // Handle input token transfer based on token type
                  if (savedOrder.input_token === TokenType.SOL) {
                    // For SOL, use SystemProgram.transfer
                    const transferSolIx = SystemProgram.transfer({
                      fromPubkey: new PublicKey(savedOrder.wallet.sol_address),
                      toPubkey: new PublicKey(this.configService.get('MMP_MINT')), // Direct to MMP mint
                      lamports: savedOrder.input_amount * 1e9, // Convert SOL to lamports
                    });
                    transaction.add(transferSolIx);
                  } else {
                    // For SPL tokens (USDT, USDC)
                    const inputMint = new PublicKey(this.configService.get(`${savedOrder.input_token}_MINT`));
                    const inputTokenAccount = await this.connection.getTokenAccountsByOwner(
                      new PublicKey(savedOrder.wallet.sol_address),
                      { mint: inputMint }
                    );

                    if (inputTokenAccount.value.length === 0) {
                      throw new BadRequestException(`No ${savedOrder.input_token} token account found`);
                    }

                    const transferInputIx = createTransferInstruction(
                      inputTokenAccount.value[0].pubkey,
                      new PublicKey(this.configService.get('MMP_MINT')), // Direct to MMP mint
                      new PublicKey(savedOrder.wallet.sol_address),
                      savedOrder.input_amount
                    );
                    transaction.add(transferInputIx);
                  }

                  // Handle MMP token transfer
                  const outputTokenAccount = await this.connection.getTokenAccountsByOwner(
                    new PublicKey(savedOrder.wallet.sol_address),
                    { mint: mmpMint }
                  );

                  if (outputTokenAccount.value.length === 0) {
                    throw new BadRequestException('No MMP token account found');
                  }

                  const transferOutputIx = createTransferInstruction(
                    new PublicKey(this.configService.get('MMP_MINT')),
                    outputTokenAccount.value[0].pubkey,
                    new PublicKey(savedOrder.wallet.sol_address),
                    savedOrder.mmp_received
                  );
                  transaction.add(transferOutputIx);

                  const txHash = await sendAndConfirmTransaction(
                    this.connection,
                    transaction,
                    [Keypair.fromSecretKey(Buffer.from(savedOrder.wallet.private_key, 'base64'))]
                  );

                  // Update order status and transaction hash
                  savedOrder.status = SwapOrderStatus.COMPLETED;
                  savedOrder.tx_hash_ref = txHash;
                  await this.swapOrderRepository.save(savedOrder);
                } catch (error) {
                  this.logger.error(`Error swapping token: ${error.message}`);
                  savedOrder.status = SwapOrderStatus.FAILED;
                  await this.swapOrderRepository.save(savedOrder);
                }
              }
            } catch (error) {
              this.logger.error(`Error processing transaction: ${error.message}`);
            }
          }
        );

        // Timeout sau 5 phút nếu không có giao dịch
        setTimeout(async () => {
          if (savedOrder.status === SwapOrderStatus.PENDING) {
            savedOrder.status = SwapOrderStatus.FAILED;
            await this.swapOrderRepository.save(savedOrder);
          }
        }, 5 * 60 * 1000);

      } catch (error) {
        this.logger.error(`Error listening to transaction: ${error.message}`);
        savedOrder.status = SwapOrderStatus.FAILED;
        await this.swapOrderRepository.save(savedOrder);
      }

      return savedOrder;
    } catch (error) {
      this.logger.error(`Error creating swap order: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  async findByWalletId(walletId: number): Promise<SwapOrder[]> {
    return this.swapOrderRepository.find({
      where: { wallet_id: walletId },
      order: { created_at: 'DESC' }
    });
  }
} 