import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, SystemProgram } from '@solana/web3.js';
import { SwapOrder, TokenType, SwapOrderStatus } from './swap-order.entity';
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { TOKEN_PROGRAM_ID, getMint, createMintToInstruction, createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly connection: Connection;
  private readonly swapPoolAuthority: Keypair;

  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    private configService: ConfigService,
  ) {
    this.connection = new Connection(this.configService.get('SOLANA_RPC_URL'));
    // Load swap pool authority from environment
    this.swapPoolAuthority = Keypair.fromSecretKey(
      Uint8Array.from(Buffer.from(this.configService.get('SWAP_POOL_AUTHORITY_PRIVATE_KEY'), 'base64'))
    );
  }

  async create(wallet: any, dto: CreateSwapOrderDto): Promise<SwapOrder> {
    try {
      // 1. Validate input
      if (dto.input_amount <= 0) {
        throw new BadRequestException('Input amount must be greater than 0');
      }

      // 2. Check balance
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

      // 3. Calculate MMP amount and swap rate
      const IDO_PRICE = 0.0001; // $0.0001 per token
      const tokenPrices = {
        [TokenType.SOL]: 100, // $100 per SOL
        [TokenType.USDT]: 1,  // $1 per USDT
        [TokenType.USDC]: 1,  // $1 per USDC
      };
      const inputPrice = tokenPrices[dto.input_token];
      const mmpAmount = Math.floor((dto.input_amount * inputPrice) / IDO_PRICE);

      // 4. Create and save swap order
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: wallet.id,
        input_token: dto.input_token,
        input_amount: dto.input_amount,
        mmp_received: mmpAmount,
        swap_rate: inputPrice,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 5. Execute swap transaction
      try {
        const transaction = new Transaction();
        const userPublicKey = new PublicKey(wallet.sol_address);
        const mmpMint = new PublicKey(this.configService.get('MMP_MINT'));

        // Get or create user's MMP token account
        const userMmpTokenAccount = await getAssociatedTokenAddress(
          mmpMint,
          userPublicKey
        );

        // Check if user's MMP token account exists
        const userMmpAccountInfo = await this.connection.getAccountInfo(userMmpTokenAccount);
        if (!userMmpAccountInfo) {
          // Create user's MMP token account if it doesn't exist
          transaction.add(
            createAssociatedTokenAccountInstruction(
              userPublicKey,
              userMmpTokenAccount,
              userPublicKey,
              mmpMint
            )
          );
        }

        // Handle input token transfer
        if (dto.input_token === TokenType.SOL) {
          // For SOL, transfer to swap pool
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: userPublicKey,
              toPubkey: new PublicKey(this.configService.get('SWAP_POOL_ADDRESS')),
              lamports: dto.input_amount * 1e9, // Convert SOL to lamports
            })
          );
        } else {
          // For SPL tokens (USDT, USDC)
          const inputMint = new PublicKey(this.configService.get(`${dto.input_token}_MINT`));
          const inputTokenAccount = await this.connection.getTokenAccountsByOwner(
            userPublicKey,
            { mint: inputMint }
          );

          if (inputTokenAccount.value.length === 0) {
            throw new BadRequestException(`No ${dto.input_token} token account found`);
          }

          transaction.add(
            createTransferInstruction(
              inputTokenAccount.value[0].pubkey,
              new PublicKey(this.configService.get('SWAP_POOL_ADDRESS')),
              userPublicKey,
              dto.input_amount
            )
          );
        }

        // Mint MMP tokens to user
        transaction.add(
          createMintToInstruction(
            mmpMint,
            userMmpTokenAccount,
            this.swapPoolAuthority.publicKey,
            mmpAmount
          )
        );

        // Send and confirm transaction
        const txHash = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.swapPoolAuthority]
        );

        // Update order status
        savedOrder.status = SwapOrderStatus.COMPLETED;
        savedOrder.tx_hash_ref = txHash;
        await this.swapOrderRepository.save(savedOrder);

        return savedOrder;
      } catch (error) {
        this.logger.error(`Error executing swap: ${error.message}`);
        savedOrder.status = SwapOrderStatus.FAILED;
        await this.swapOrderRepository.save(savedOrder);
        throw new BadRequestException(`Swap failed: ${error.message}`);
      }
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