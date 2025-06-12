import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { SwapOrder, TokenType, SwapOrderStatus } from './swap-order.entity';
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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
      const rates = {
        [TokenType.SOL]: 100,
        [TokenType.USDT]: 100,
        [TokenType.USDC]: 100
      };
      const swapRate = rates[dto.input_token];
      const mmpAmount = dto.input_amount * swapRate;

      // 4. Tạo và lưu swap order
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: wallet.id,
        input_token: dto.input_token,
        input_amount: dto.input_amount,
        mmp_received: mmpAmount,
        swap_rate: swapRate,
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
                savedOrder.status = SwapOrderStatus.COMPLETED;
                await this.swapOrderRepository.save(savedOrder);
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