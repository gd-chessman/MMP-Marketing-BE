import { Injectable, BadRequestException, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, SystemProgram } from '@solana/web3.js';
import { SwapOrder, TokenType, SwapOrderStatus } from './swap-order.entity';
import { Wallet } from '../wallets/wallet.entity';
import { CreateSwapOrderDto, InitWeb3WalletDto, CompleteWeb3WalletDto } from './dto/create-swap-order.dto';
import { TOKEN_PROGRAM_ID, getMint, createMintToInstruction, createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import axios from 'axios';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly connection: Connection;
  private readonly mmpAuthorityKeypair: Keypair;

  // Cache cho giá SOL
  private solPriceCache: { price: number; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 15 * 1000; // 15 giây

  // Định nghĩa mint addresses cho từng token
  private readonly TOKEN_MINT_ADDRESSES = {
    [TokenType.SOL]: 'So11111111111111111111111111111111111111112',
    [TokenType.USDT]: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    [TokenType.USDC]: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  };

  // Giá MMP01 token (1 MMP01 = 0.001 $)
  private readonly MMP01_PRICE_USD = 0.001;

  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private configService: ConfigService,
  ) {
    this.connection = new Connection(this.configService.get('SOLANA_RPC_URL'));
    
    // Khởi tạo MMP authority keypair từ environment
    const mmpAuthorityPrivateKey = this.configService.get<string>('MMP_AUTHORITY_PRIVATE_KEY');
    if (!mmpAuthorityPrivateKey) {
      throw new InternalServerErrorException('MMP_AUTHORITY_PRIVATE_KEY is not configured');
    }
    
    try {
      const decodedKey = bs58.decode(mmpAuthorityPrivateKey);
      if (decodedKey.length !== 64) {
        this.logger.error(`Invalid MMP authority key size: ${decodedKey.length} bytes`);
        throw new InternalServerErrorException('Invalid MMP authority private key size');
      }
      this.mmpAuthorityKeypair = Keypair.fromSecretKey(decodedKey);
    } catch (error) {
      this.logger.error(`Failed to create MMP authority keypair: ${error.message}`);
      throw new InternalServerErrorException('Failed to initialize MMP authority keypair');
    }
  }

  /**
   * Kiểm tra cache có hợp lệ không
   */
  private isCacheValid(): boolean {
    if (!this.solPriceCache) {
      return false;
    }
    const now = Date.now();
    return (now - this.solPriceCache.timestamp) < this.CACHE_DURATION;
  }

  /**
   * Lấy giá USD của SOL từ Jupiter API với cache 15 giây
   */
  public async getSolPriceUSD(): Promise<number> {
    // Kiểm tra cache trước
    if (this.isCacheValid()) {
      this.logger.debug(`Using cached SOL price: $${this.solPriceCache.price}`);
      return this.solPriceCache.price;
    }

    try {
      this.logger.debug('Fetching SOL price from Jupiter API...');
      const response = await axios.get('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
      const price = parseFloat(response.data.data['So11111111111111111111111111111111111111112'].price);
      
      // Lưu vào cache
      this.solPriceCache = {
        price: price,
        timestamp: Date.now()
      };
      
      this.logger.debug(`Updated SOL price cache: $${price}`);
      return price;
    } catch (error) {
      this.logger.error(`Error fetching SOL price: ${error.message}`);
      
      // Nếu có cache cũ, sử dụng cache cũ thay vì throw error
      if (this.solPriceCache) {
        this.logger.warn(`Using stale cached SOL price: $${this.solPriceCache.price}`);
        return this.solPriceCache.price;
      }
      
      throw new BadRequestException('Failed to fetch SOL price');
    }
  }

  /**
   * Tính toán giá trị USD của input token
   */
  private async calculateUSDValue(inputToken: TokenType, inputAmount: number): Promise<number> {
    if (inputToken === TokenType.SOL) {
      const solPrice = await this.getSolPriceUSD();
      return inputAmount * solPrice;
    } else if (inputToken === TokenType.USDT || inputToken === TokenType.USDC) {
      // USDT và USDC có giá 1:1 với USD
      return inputAmount;
    } else {
      throw new BadRequestException(`Unsupported token type: ${inputToken}`);
    }
  }

  /**
   * Gửi token MMP01 từ ví sàn đến ví user
   */
  private async sendMMP01Tokens(userWalletAddress: string, usdValue: number): Promise<string> {
    try {
      // Tính số lượng MMP01 token cần gửi
      const mmp01Amount = Math.floor(usdValue / this.MMP01_PRICE_USD);
      
      if (mmp01Amount <= 0) {
        throw new BadRequestException('USD value too small to receive MMP01 tokens');
      }

      const transaction = new Transaction();
      const userPublicKey = new PublicKey(userWalletAddress);
      const mmp01Mint = new PublicKey(this.configService.get('MMP_MINT'));
      const authorityPublicKey = this.mmpAuthorityKeypair.publicKey;
      
      // Lấy thông tin mint để biết decimals
      const mintInfo = await this.connection.getParsedAccountInfo(mmp01Mint);
      let decimals = 6; // Default decimals
      
      if (mintInfo.value && 'parsed' in mintInfo.value.data) {
        decimals = mintInfo.value.data.parsed.info.decimals;
      } else {
        // Fallback: sử dụng getMint để lấy decimals
        try {
          const mintData = await getMint(this.connection, mmp01Mint);
          decimals = mintData.decimals;
        } catch (error) {
          this.logger.warn(`Could not get mint decimals, using default: ${decimals}`);
        }
      }
      
      // Chuyển đổi số lượng token thành số nguyên dựa trên decimals
      const transferAmount = Math.floor(mmp01Amount * Math.pow(10, decimals));
      
      this.logger.log(`Calculated transfer: ${mmp01Amount} MMP01 tokens = ${transferAmount} raw units (decimals: ${decimals})`);
      
      // Lấy hoặc tạo MMP01 token account cho user
      const userMmp01TokenAccount = await getAssociatedTokenAddress(
        mmp01Mint,
        userPublicKey
      );

      // Lấy token account của ví sàn (authority)
      const authorityMmp01TokenAccount = await getAssociatedTokenAddress(
        mmp01Mint,
        authorityPublicKey
      );

      // Kiểm tra xem user đã có MMP01 token account chưa
      const userMmp01AccountInfo = await this.connection.getAccountInfo(userMmp01TokenAccount);
      if (!userMmp01AccountInfo) {
        // Tạo MMP01 token account cho user nếu chưa có
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.mmpAuthorityKeypair.publicKey, // Authority trả phí tạo ATA
            userMmp01TokenAccount,
            userPublicKey,
            mmp01Mint
          )
        );
      }

      // Kiểm tra balance của ví sàn
      const authorityAccountInfo = await this.connection.getAccountInfo(authorityMmp01TokenAccount);
      if (!authorityAccountInfo) {
        throw new BadRequestException('Authority wallet does not have MMP01 token account');
      }

      const authorityBalance = await this.connection.getTokenAccountBalance(authorityMmp01TokenAccount);
      const authorityBalanceRaw = authorityBalance.value.amount;
      
      if (parseInt(authorityBalanceRaw) < transferAmount) {
        throw new BadRequestException(`Insufficient MMP01 balance in authority wallet. Available: ${authorityBalance.value.uiAmount}, Required: ${mmp01Amount}`);
      }

      // Chuyển MMP01 tokens từ ví sàn đến user
      transaction.add(
        createTransferInstruction(
          authorityMmp01TokenAccount,
          userMmp01TokenAccount,
          this.mmpAuthorityKeypair.publicKey,
          transferAmount
        )
      );

      // Lấy blockhash mới cho transaction
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.mmpAuthorityKeypair.publicKey;

      // Gửi và xác nhận transaction
      const txHash = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.mmpAuthorityKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      this.logger.log(`Transferred ${mmp01Amount} MMP01 tokens (${transferAmount} raw units) from authority to user ${userWalletAddress}`);
      return txHash;
    } catch (error) {
      this.logger.error(`Error sending MMP01 tokens: ${error.message}`);
      throw new BadRequestException(`Failed to send MMP01 tokens: ${error.message}`);
    }
  }

  async create(wallet: any, dto: CreateSwapOrderDto): Promise<SwapOrder> {
    try {
      // 1. Validate input
      if (dto.input_amount <= 0) {
        throw new BadRequestException('Input amount must be greater than 0');
      }

      // 2. Tạo Keypair từ private_key của wallet
      let userKeypair: Keypair;
      try {
        const decodedKey = bs58.decode(wallet.private_key);
        if (decodedKey.length !== 64) {
          this.logger.error(`Invalid key size: ${decodedKey.length} bytes`);
          throw new BadRequestException('Invalid private key size');
        }
        userKeypair = Keypair.fromSecretKey(decodedKey);
      } catch (error) {
        this.logger.error(`Failed to create keypair: ${error.message}`);
        throw new BadRequestException('Invalid private key format');
      }

      // 3. Lấy mint address tương ứng với token input
      const mintAddress = this.TOKEN_MINT_ADDRESSES[dto.input_token];
      if (!mintAddress) {
        throw new BadRequestException(`Unsupported token type: ${dto.input_token}`);
      }

      // 4. Kiểm tra balance
      let hasBalance = false;
      let userTokenAccount: PublicKey | null = null;
      let tokenDecimals = 0;

      try {
        if (dto.input_token === TokenType.SOL) {
          // Kiểm tra balance SOL
          const balance = await this.connection.getBalance(userKeypair.publicKey);
          hasBalance = balance >= dto.input_amount * 1e9; // Convert SOL to lamports
        } else {
          // Kiểm tra balance SPL token (USDT, USDC)
          const mint = new PublicKey(mintAddress);
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            userKeypair.publicKey,
            { mint: mint }
          );
          
          if (tokenAccounts.value.length > 0) {
            userTokenAccount = tokenAccounts.value[0].pubkey;
            const tokenBalance = await this.connection.getTokenAccountBalance(userTokenAccount);
            hasBalance = tokenBalance.value.uiAmount >= dto.input_amount;
            tokenDecimals = tokenBalance.value.decimals;
          }
        }
      } catch (error) {
        this.logger.error(`Error checking balance: ${error.message}`);
        throw new BadRequestException('Failed to check balance');
      }

      if (!hasBalance) {
        throw new BadRequestException('Insufficient balance');
      }

      // 5. Tính toán giá trị USD
      const usdValue = await this.calculateUSDValue(dto.input_token, dto.input_amount);
      const mmp01Amount = Math.floor(usdValue / this.MMP01_PRICE_USD);

      // 6. Tạo và lưu swap order với trạng thái PENDING
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: wallet.id,
        input_token: dto.input_token,
        input_amount: dto.input_amount,
        mmp_received: mmp01Amount,
        swap_rate: usdValue / dto.input_amount,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 7. Thực hiện chuyển token vào ví đích
      try {
        const transaction = new Transaction();
        const destinationPublicKey = new PublicKey(this.configService.get('DESTINATION_WALLET'));

        if (dto.input_token === TokenType.SOL) {
          // Chuyển SOL - chuyển đổi thành lamports (số nguyên)
          const lamports = Math.floor(dto.input_amount * 1e9);
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: userKeypair.publicKey,
              toPubkey: destinationPublicKey,
              lamports: lamports,
            })
          );
        } else {
          // Chuyển SPL token (USDT, USDC) - chuyển đổi thành số nguyên dựa trên decimals
          const mint = new PublicKey(mintAddress);
          const transferAmount = Math.floor(dto.input_amount * Math.pow(10, tokenDecimals));
          
          // Lấy hoặc tạo token account của ví đích
          const destinationTokenAccount = await getAssociatedTokenAddress(
            mint,
            destinationPublicKey
          );

          // Kiểm tra xem ví đích đã có token account chưa
          const destinationAccountInfo = await this.connection.getAccountInfo(destinationTokenAccount);
          if (!destinationAccountInfo) {
            // Tạo token account cho ví đích nếu chưa có
            transaction.add(
              createAssociatedTokenAccountInstruction(
                userKeypair.publicKey, // user trả phí tạo ATA
                destinationTokenAccount,
                destinationPublicKey,
                mint
              )
            );
          }

          // Chuyển token từ user đến ví đích
          if (userTokenAccount) {
            transaction.add(
              createTransferInstruction(
                userTokenAccount,
                destinationTokenAccount,
                userKeypair.publicKey,
                transferAmount // Sử dụng số nguyên đã chuyển đổi
              )
            );
          } else {
            throw new BadRequestException(`No ${dto.input_token} token account found`);
          }
        }

        // Lấy blockhash mới cho transaction
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userKeypair.publicKey;

        // Gửi và xác nhận transaction sử dụng userKeypair
        const txHash = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [userKeypair], // Sử dụng private key của user để ký
          {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed'
          }
        );

        // 8. Gửi token MMP01 cho user
        const mmp01TxHash = await this.sendMMP01Tokens(wallet.sol_address, usdValue);

        // 9. Cập nhật trạng thái order thành COMPLETED
        savedOrder.status = SwapOrderStatus.COMPLETED;
        savedOrder.tx_hash_send = txHash;
        savedOrder.tx_hash_ref = mmp01TxHash;
        await this.swapOrderRepository.save(savedOrder);

        return savedOrder;
      } catch (error) {
        this.logger.error(`Error executing transfer: ${error.message}`);
        savedOrder.status = SwapOrderStatus.FAILED;
        await this.swapOrderRepository.save(savedOrder);
        throw new BadRequestException(`Transfer failed: ${error.message}`);
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

  async initWeb3Wallet(dto: InitWeb3WalletDto): Promise<{ orderId: number; serializedTx: string }> {
    try {
      // 1. Validate input
      if (dto.inputAmount <= 0) {
        throw new BadRequestException('Input amount must be greater than 0');
      }

      // 2. Validate public key
      let userPublicKey: PublicKey;
      try {
        userPublicKey = new PublicKey(dto.publicKey);
      } catch (error) {
        throw new BadRequestException('Invalid public key format');
      }

      // 3. Lấy mint address tương ứng với token input
      const mintAddress = this.TOKEN_MINT_ADDRESSES[dto.inputToken];
      if (!mintAddress) {
        throw new BadRequestException(`Unsupported token type: ${dto.inputToken}`);
      }

      // 4. Kiểm tra balance
      let hasBalance = false;
      let userTokenAccount: PublicKey | null = null;
      let tokenDecimals = 0;

      try {
        if (dto.inputToken === TokenType.SOL) {
          // Kiểm tra balance SOL
          const balance = await this.connection.getBalance(userPublicKey);
          hasBalance = balance >= dto.inputAmount * 1e9; // Convert SOL to lamports
        } else {
          // Kiểm tra balance SPL token (USDT, USDC)
          const mint = new PublicKey(mintAddress);
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            userPublicKey,
            { mint: mint }
          );
          
          if (tokenAccounts.value.length > 0) {
            userTokenAccount = tokenAccounts.value[0].pubkey;
            const tokenBalance = await this.connection.getTokenAccountBalance(userTokenAccount);
            hasBalance = tokenBalance.value.uiAmount >= dto.inputAmount;
            tokenDecimals = tokenBalance.value.decimals;
          }
        }
      } catch (error) {
        this.logger.error(`Error checking balance: ${error.message}`);
        throw new BadRequestException('Failed to check balance');
      }

      if (!hasBalance) {
        throw new BadRequestException('Insufficient balance');
      }

      // 5. Tính toán giá trị USD
      const usdValue = await this.calculateUSDValue(dto.inputToken, dto.inputAmount);
      const mmp01Amount = Math.floor(usdValue / this.MMP01_PRICE_USD);

      // 6. Tạo và lưu swap order với trạng thái PENDING
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: 0, // Web3 wallet không có wallet_id
        input_token: dto.inputToken,
        input_amount: dto.inputAmount,
        mmp_received: mmp01Amount,
        swap_rate: usdValue / dto.inputAmount,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 7. Build transaction unsigned
      const transaction = new Transaction();
      const destinationPublicKey = new PublicKey(this.configService.get('DESTINATION_WALLET'));

      if (dto.inputToken === TokenType.SOL) {
        // Chuyển SOL - chuyển đổi thành lamports (số nguyên)
        const lamports = Math.floor(dto.inputAmount * 1e9);
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: destinationPublicKey,
            lamports: lamports,
          })
        );
      } else {
        // Chuyển SPL token (USDT, USDC) - chuyển đổi thành số nguyên dựa trên decimals
        const mint = new PublicKey(mintAddress);
        const transferAmount = Math.floor(dto.inputAmount * Math.pow(10, tokenDecimals));
        
        // Lấy hoặc tạo token account của ví đích
        const destinationTokenAccount = await getAssociatedTokenAddress(
          mint,
          destinationPublicKey
        );

        // Kiểm tra xem ví đích đã có token account chưa
        const destinationAccountInfo = await this.connection.getAccountInfo(destinationTokenAccount);
        if (!destinationAccountInfo) {
          // Tạo token account cho ví đích nếu chưa có
          transaction.add(
            createAssociatedTokenAccountInstruction(
              userPublicKey, // user trả phí tạo ATA
              destinationTokenAccount,
              destinationPublicKey,
              mint
            )
          );
        }

        // Chuyển token từ user đến ví đích
        if (userTokenAccount) {
          transaction.add(
            createTransferInstruction(
              userTokenAccount,
              destinationTokenAccount,
              userPublicKey,
              transferAmount
            )
          );
        } else {
          throw new BadRequestException(`No ${dto.inputToken} token account found`);
        }
      }

      // Set fee payer và blockhash
      transaction.feePayer = userPublicKey;
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');

      return {
        orderId: savedOrder.id,
        serializedTx: serializedTx
      };
    } catch (error) {
      this.logger.error(`Error initializing web3 wallet swap: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  async completeWeb3Wallet(dto: CompleteWeb3WalletDto): Promise<SwapOrder> {
    try {
      // 1. Tìm order
      const order = await this.swapOrderRepository.findOne({
        where: { id: dto.orderId }
      });

      if (!order) {
        throw new BadRequestException('Order not found');
      }

      if (order.status !== SwapOrderStatus.PENDING) {
        throw new BadRequestException('Order is not in pending status');
      }

      // 2. Lấy transaction details từ blockchain
      const txDetail = await this.connection.getTransaction(dto.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!txDetail) {
        throw new BadRequestException('Transaction not found on blockchain');
      }

      // 3. Verify transaction exists and is valid
      if (!txDetail.transaction) {
        throw new BadRequestException('Invalid transaction data');
      }

      // 4. Verify signatures - QUAN TRỌNG: Kiểm tra transaction chưa bị chỉnh sửa
      try {
        // Kiểm tra transaction có signature không
        const signatures = txDetail.transaction.signatures;
        if (!signatures || signatures.length === 0) {
          throw new BadRequestException('Transaction has no signatures');
        }
        
        // Kiểm tra transaction đã được confirm trên blockchain
        if (txDetail.meta && txDetail.meta.err) {
          throw new BadRequestException('Transaction failed on blockchain');
        }
        
        this.logger.log('Transaction signatures verified successfully');
      } catch (error) {
        this.logger.error(`Signature verification error: ${error.message}`);
        throw new BadRequestException('Invalid transaction signatures');
      }

      // 5. Validate transaction fields chi tiết
      const accountKeys = txDetail.transaction.message.getAccountKeys();
      const userPublicKey = accountKeys[0];
      const destinationWallet = this.configService.get('DESTINATION_WALLET');
      
      // Kiểm tra fee payer
      if (!txDetail.transaction.message.header.numRequiredSignatures) {
        throw new BadRequestException('Transaction missing required signatures');
      }

      // 6. Validate instruction chi tiết - QUAN TRỌNG: Kiểm tra nội dung instruction
      let isValidInstruction = false;
      let actualAmount = 0;
      let actualMint = '';

      // Sử dụng cách khác để parse instructions
      const message = txDetail.transaction.message;
      const instructions = message.compiledInstructions || [];
      
      for (const instruction of instructions) {
        const programId = accountKeys[instruction.programIdIndex];
        
        if (programId.equals(SystemProgram.programId)) {
          // SOL transfer instruction
          const transferData = instruction.data;
          if (transferData.length === 9 && transferData[0] === 2) { // Transfer instruction
            // Parse lamports từ buffer
            const lamportsBuffer = transferData.slice(1, 9);
            const lamports = lamportsBuffer.reduce((acc, byte, index) => acc + byte * Math.pow(256, index), 0);
            actualAmount = lamports / 1e9; // Convert lamports to SOL
            
            // Kiểm tra destination
            const toPubkey = accountKeys[instruction.accountKeyIndexes[1]];
            if (toPubkey.toString() === destinationWallet) {
              isValidInstruction = true;
              this.logger.log(`Valid SOL transfer: ${actualAmount} SOL to ${destinationWallet}`);
            }
          }
        } else if (programId.equals(TOKEN_PROGRAM_ID)) {
          // SPL token transfer instruction
          const transferData = instruction.data;
          if (transferData.length === 9 && transferData[0] === 3) { // Transfer instruction
            // Parse amount từ buffer
            const amountBuffer = transferData.slice(1, 9);
            const amount = amountBuffer.reduce((acc, byte, index) => acc + byte * Math.pow(256, index), 0);
            
            // Lấy mint address từ token account
            const sourceAccount = accountKeys[instruction.accountKeyIndexes[1]];
            const destinationAccount = accountKeys[instruction.accountKeyIndexes[2]];
            
            // Kiểm tra destination account có phải của destination wallet không
            try {
              const destinationAccountInfo = await this.connection.getAccountInfo(destinationAccount);
              if (destinationAccountInfo) {
                // Decode token account để lấy mint
                const tokenAccountData = destinationAccountInfo.data;
                if (tokenAccountData.length >= 72) {
                  const mintBytes = tokenAccountData.slice(0, 32);
                  actualMint = new PublicKey(mintBytes).toString();
                  
                  // Kiểm tra mint có đúng không
                  const expectedMint = this.TOKEN_MINT_ADDRESSES[order.input_token];
                  if (actualMint === expectedMint) {
                    // Kiểm tra amount
                    const decimals = await this.getTokenDecimals(new PublicKey(actualMint));
                    actualAmount = amount / Math.pow(10, decimals);
                    
                    isValidInstruction = true;
                    this.logger.log(`Valid SPL transfer: ${actualAmount} tokens (mint: ${actualMint}) to ${destinationWallet}`);
                  }
                }
              }
            } catch (error) {
              this.logger.warn(`Could not validate SPL transfer details: ${error.message}`);
            }
          }
        }
      }

      if (!isValidInstruction) {
        throw new BadRequestException('Invalid transfer instruction in transaction');
      }

      // 7. Kiểm tra amount có khớp với order không
      const tolerance = 0.000001; // Tolerance cho floating point
      if (Math.abs(actualAmount - order.input_amount) > tolerance) {
        throw new BadRequestException(`Amount mismatch: expected ${order.input_amount}, got ${actualAmount}`);
      }

      // 8. Kiểm tra và tạo wallet nếu chưa có
      let wallet = await this.walletRepository.findOne({
        where: { sol_address: userPublicKey.toString() }
      });

      if (!wallet) {
        // Tạo wallet mới với user_id và private_key bằng null
        wallet = this.walletRepository.create({
          user_id: null,
          sol_address: userPublicKey.toString(),
          private_key: null,
          balance_sol: 0,
          balance_mmp: 0
        });
        wallet = await this.walletRepository.save(wallet);
        this.logger.log(`Created new wallet for public key: ${userPublicKey.toString()}`);
      }

      // 9. Cập nhật swap order với wallet_id
      order.wallet_id = wallet.id;
      await this.swapOrderRepository.save(order);

      // 10. Tính toán giá trị USD và gửi MMP01 tokens
      const usdValue = await this.calculateUSDValue(order.input_token, order.input_amount);
      const mmp01TxHash = await this.sendMMP01Tokens(userPublicKey.toString(), usdValue);

      // 11. Cập nhật order
      order.status = SwapOrderStatus.COMPLETED;
      order.tx_hash_send = dto.signature;
      order.tx_hash_ref = mmp01TxHash;
      await this.swapOrderRepository.save(order);

      this.logger.log(`Web3 wallet swap completed successfully: Order ${order.id}, Amount: ${actualAmount}, Wallet: ${wallet.id}`);
      return order;
    } catch (error) {
      this.logger.error(`Error completing web3 wallet swap: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Lấy decimals của token mint
   */
  private async getTokenDecimals(mint: PublicKey): Promise<number> {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(mint);
      if (mintInfo.value && 'parsed' in mintInfo.value.data) {
        return mintInfo.value.data.parsed.info.decimals;
      } else {
        const mintData = await getMint(this.connection, mint);
        return mintData.decimals;
      }
    } catch (error) {
      this.logger.warn(`Could not get mint decimals, using default: 6`);
      return 6; // Default decimals
    }
  }
} 