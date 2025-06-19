import { Injectable, BadRequestException, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, SystemProgram } from '@solana/web3.js';
import { SwapOrder, TokenType, SwapOrderStatus, OutputTokenType } from './swap-order.entity';
import { Wallet } from '../wallets/wallet.entity';
import { CreateSwapOrderDto, InitWeb3WalletDto, CompleteWeb3WalletDto } from './dto/create-swap-order.dto';
import { TOKEN_PROGRAM_ID, getMint, createMintToInstruction, createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import axios from 'axios';
import { ReferralRewardService } from '../referral-rewards/referral-reward.service';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);
  private readonly connection: Connection;
  private readonly mmpAuthorityKeypair: Keypair;
  private readonly mpbAuthorityKeypair: Keypair;

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

  // Giá MPB token (1 MPB = 0.001 $)
  private readonly MPB_PRICE_USD = 0.001;

  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private configService: ConfigService,
    private referralRewardService: ReferralRewardService,
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

    // Khởi tạo MPB authority keypair từ environment
    const mpbAuthorityPrivateKey = this.configService.get<string>('MPB_AUTHORITY_PRIVATE_KEY');
    if (!mpbAuthorityPrivateKey) {
      throw new InternalServerErrorException('MPB_AUTHORITY_PRIVATE_KEY is not configured');
    }
    
    try {
      const decodedKey = bs58.decode(mpbAuthorityPrivateKey);
      if (decodedKey.length !== 64) {
        this.logger.error(`Invalid MPB authority key size: ${decodedKey.length} bytes`);
        throw new InternalServerErrorException('Invalid MPB authority private key size');
      }
      this.mpbAuthorityKeypair = Keypair.fromSecretKey(decodedKey);
    } catch (error) {
      this.logger.error(`Failed to create MPB authority keypair: ${error.message}`);
      throw new InternalServerErrorException('Failed to initialize MPB authority keypair');
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
      // this.logger.debug('Fetching SOL price from Jupiter API...');
      const response = await axios.get('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
      const price = parseFloat(response.data.data['So11111111111111111111111111111111111111112'].price);
      
      // Lưu vào cache
      this.solPriceCache = {
        price: price,
        timestamp: Date.now()
      };
      
      // this.logger.debug(`Updated SOL price cache: $${price}`);
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
      
      // this.logger.log(`Calculated transfer: ${mmp01Amount} MMP01 tokens = ${transferAmount} raw units (decimals: ${decimals})`);
      
      // Lấy MMP01 token account cho user
      const userMmp01TokenAccount = await getAssociatedTokenAddress(
        mmp01Mint,
        userPublicKey
      );

      // Thêm retry logic để kiểm tra ATA
      let userMmp01AccountInfo = null;
      let retryCount = 0;
      const maxRetries = 10; // Tăng số lần retry
      const retryDelay = 3000; // 3 second

      // this.logger.debug(`Starting to check MMP01 token account for user: ${userWalletAddress}`);
      // this.logger.debug(`Token account address: ${userMmp01TokenAccount.toString()}`);

      while (retryCount < maxRetries) {
        // this.logger.debug(`Attempt ${retryCount + 1}/${maxRetries} to check MMP01 token account...`);
        
        userMmp01AccountInfo = await this.connection.getAccountInfo(
          userMmp01TokenAccount,
          'finalized' // Sử dụng commitment level cao hơn
        );
        
        if (userMmp01AccountInfo) {
          // this.logger.debug(`MMP01 token account found after ${retryCount} retries`);
          // this.logger.debug(`Account data size: ${userMmp01AccountInfo.data.length} bytes`);
          break;
        }
        
        this.logger.debug(`Retry ${retryCount + 1}/${maxRetries}: Token account not found, waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryCount++;
      }

      if (!userMmp01AccountInfo) {
        this.logger.error(`Failed to find MMP01 token account after ${maxRetries} attempts`);
        throw new BadRequestException('User does not have MMP01 token account. Please create it using your wallet before swapping.');
      }

      // Lấy token account của ví sàn (authority)
      const authorityMmp01TokenAccount = await getAssociatedTokenAddress(
        mmp01Mint,
        authorityPublicKey
      );

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
      transaction.feePayer = this.mmpAuthorityKeypair.publicKey; // Fee payer là authority

      // Gửi và xác nhận transaction, chỉ cần authority ký
      const txHash = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.mmpAuthorityKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      // this.logger.log(`Transferred ${mmp01Amount} MMP01 tokens (${transferAmount} raw units) from authority to user ${userWalletAddress}`);
      return txHash;
    } catch (error) {
      this.logger.error(`Error sending MMP01 tokens: ${error.message}`);
      throw new BadRequestException(`Failed to send MMP01 tokens: ${error.message}`);
    }
  }

  /**
   * Gửi token MPB từ ví sàn đến ví user
   */
  private async sendMPBTokens(userWalletAddress: string, usdValue: number): Promise<string> {
    try {
      // Tính số lượng MPB token cần gửi
      const mpbAmount = Math.floor(usdValue / this.MPB_PRICE_USD);
      
      if (mpbAmount <= 0) {
        throw new BadRequestException('USD value too small to receive MPB tokens');
      }

      const transaction = new Transaction();
      const userPublicKey = new PublicKey(userWalletAddress);
      const mpbMint = new PublicKey(this.configService.get('MPB_MINT'));
      const authorityPublicKey = this.mpbAuthorityKeypair.publicKey;
      
      // Lấy thông tin mint để biết decimals
      const mintInfo = await this.connection.getParsedAccountInfo(mpbMint);
      let decimals = 6; // Default decimals
      
      if (mintInfo.value && 'parsed' in mintInfo.value.data) {
        decimals = mintInfo.value.data.parsed.info.decimals;
      } else {
        // Fallback: sử dụng getMint để lấy decimals
        try {
          const mintData = await getMint(this.connection, mpbMint);
          decimals = mintData.decimals;
        } catch (error) {
          this.logger.warn(`Could not get mint decimals, using default: ${decimals}`);
        }
      }
      
      // Chuyển đổi số lượng token thành số nguyên dựa trên decimals
      const transferAmount = Math.floor(mpbAmount * Math.pow(10, decimals));
      
      // this.logger.log(`Calculated transfer: ${mpbAmount} MPB tokens = ${transferAmount} raw units (decimals: ${decimals})`);
      
      // Lấy MPB token account cho user
      const userMpbTokenAccount = await getAssociatedTokenAddress(
        mpbMint,
        userPublicKey
      );

      // Thêm retry logic để kiểm tra ATA
      let userMpbAccountInfo = null;
      let retryCount = 0;
      const maxRetries = 10; // Tăng số lần retry
      const retryDelay = 3000; // 3 second

      // this.logger.debug(`Starting to check MPB token account for user: ${userWalletAddress}`);
      // this.logger.debug(`Token account address: ${userMpbTokenAccount.toString()}`);

      while (retryCount < maxRetries) {
        // this.logger.debug(`Attempt ${retryCount + 1}/${maxRetries} to check MPB token account...`);
        
        userMpbAccountInfo = await this.connection.getAccountInfo(
          userMpbTokenAccount,
          'finalized' // Sử dụng commitment level cao hơn
        );
        
        if (userMpbAccountInfo) {
          // this.logger.debug(`MPB token account found after ${retryCount} retries`);
          // this.logger.debug(`Account data size: ${userMpbAccountInfo.data.length} bytes`);
          break;
        }
        
        this.logger.debug(`Retry ${retryCount + 1}/${maxRetries}: Token account not found, waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryCount++;
      }

      if (!userMpbAccountInfo) {
        this.logger.error(`Failed to find MPB token account after ${maxRetries} attempts`);
        throw new BadRequestException('User does not have MPB token account. Please create it using your wallet before swapping.');
      }

      // Lấy token account của ví sàn (authority)
      const authorityMpbTokenAccount = await getAssociatedTokenAddress(
        mpbMint,
        authorityPublicKey
      );

      // Kiểm tra balance của ví sàn
      const authorityAccountInfo = await this.connection.getAccountInfo(authorityMpbTokenAccount);
      if (!authorityAccountInfo) {
        throw new BadRequestException('Authority wallet does not have MPB token account');
      }

      const authorityBalance = await this.connection.getTokenAccountBalance(authorityMpbTokenAccount);
      const authorityBalanceRaw = authorityBalance.value.amount;
      
      if (parseInt(authorityBalanceRaw) < transferAmount) {
        throw new BadRequestException(`Insufficient MPB balance in authority wallet. Available: ${authorityBalance.value.uiAmount}, Required: ${mpbAmount}`);
      }

      // Chuyển MPB tokens từ ví sàn đến user
      transaction.add(
        createTransferInstruction(
          authorityMpbTokenAccount,
          userMpbTokenAccount,
          authorityPublicKey,
          transferAmount
        )
      );

      // Gửi transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.mpbAuthorityKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      this.logger.log(`Successfully sent ${mpbAmount} MPB tokens to ${userWalletAddress}`);
      return signature;
    } catch (error) {
      this.logger.error(`Failed to send MPB tokens: ${error.message}`);
      throw new BadRequestException(`Failed to send MPB tokens: ${error.message}`);
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
        output_token: dto.output_token,
        input_amount: dto.input_amount,
        swap_rate: usdValue / dto.input_amount,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 7. Kiểm tra và tạo ATA cho token output nếu cần
      if (dto.output_token === OutputTokenType.MMP) {
        const mmpMint = new PublicKey(this.configService.get('MMP_MINT'));
        const userMmpTokenAccount = await getAssociatedTokenAddress(
          mmpMint,
          userKeypair.publicKey
        );
        const userMmpAccountInfo = await this.connection.getAccountInfo(userMmpTokenAccount);
        
        if (!userMmpAccountInfo) {
          // Tạo ATA cho MMP01
          const createAtaTx = new Transaction();
          createAtaTx.add(
            createAssociatedTokenAccountInstruction(
              userKeypair.publicKey, // payer
              userMmpTokenAccount, // ata
              userKeypair.publicKey, // owner
              mmpMint // mint
            )
          );
          
          const { blockhash: ataBlockhash } = await this.connection.getLatestBlockhash();
          createAtaTx.recentBlockhash = ataBlockhash;
          createAtaTx.feePayer = userKeypair.publicKey;
          
          await sendAndConfirmTransaction(
            this.connection,
            createAtaTx,
            [userKeypair],
            {
              commitment: 'confirmed',
              preflightCommitment: 'confirmed'
            }
          );

          // Delay 4 giây sau khi tạo ATA
          await new Promise(resolve => setTimeout(resolve, 4000));
          // this.logger.debug('Delayed 4 seconds after creating MMP ATA');
        }
      } else if (dto.output_token === OutputTokenType.MPB) {
        const mpbMint = new PublicKey(this.configService.get('MPB_MINT'));
        const userMpbTokenAccount = await getAssociatedTokenAddress(
          mpbMint,
          userKeypair.publicKey
        );
        const userMpbAccountInfo = await this.connection.getAccountInfo(userMpbTokenAccount);
        
        if (!userMpbAccountInfo) {
          // Tạo ATA cho MPB
          const createAtaTx = new Transaction();
          createAtaTx.add(
            createAssociatedTokenAccountInstruction(
              userKeypair.publicKey, // payer
              userMpbTokenAccount, // ata
              userKeypair.publicKey, // owner
              mpbMint // mint
            )
          );
          
          const { blockhash: ataBlockhash } = await this.connection.getLatestBlockhash();
          createAtaTx.recentBlockhash = ataBlockhash;
          createAtaTx.feePayer = userKeypair.publicKey;
          
          await sendAndConfirmTransaction(
            this.connection,
            createAtaTx,
            [userKeypair],
            {
              commitment: 'confirmed',
              preflightCommitment: 'confirmed'
            }
          );

          // Delay 4 giây sau khi tạo ATA
          await new Promise(resolve => setTimeout(resolve, 4000));
          // this.logger.debug('Delayed 4 seconds after creating MPB ATA');
        }
      }

      // 8. Thực hiện chuyển token vào ví đích
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

        // 9. Gửi token cho user dựa vào loại token đầu ra
        let outputTxHash: string;
        if (dto.output_token === OutputTokenType.MMP) {
          outputTxHash = await this.sendMMP01Tokens(wallet.sol_address, usdValue);
          savedOrder.mmp_received = mmp01Amount;
        } else if (dto.output_token === OutputTokenType.MPB) {
          outputTxHash = await this.sendMPBTokens(wallet.sol_address, usdValue);
          savedOrder.mpb_received = usdValue / this.MPB_PRICE_USD; // Tính số lượng MPB nhận được
        } else {
          throw new BadRequestException(`Unsupported output token type: ${dto.output_token}`);
        }

        // 10. Cập nhật trạng thái order thành COMPLETED
        savedOrder.status = SwapOrderStatus.COMPLETED;
        savedOrder.tx_hash_send = txHash; this.referralRewardService.createReferralReward(savedOrder, this.solPriceCache.price)
          .catch(error => this.logger.error(`Failed to create referral reward: ${error.message}`));
        savedOrder.tx_hash_ref = outputTxHash;
        await this.swapOrderRepository.save(savedOrder);

        // 11. Tạo referral reward nếu có người giới thiệu (xử lý ngầm, không await)
       

        return savedOrder;
      } catch (error) {
        savedOrder.status = SwapOrderStatus.FAILED;
        await this.swapOrderRepository.save(savedOrder);

        const errorMessage = error.message || '';
        if (errorMessage.includes('insufficient lamports')) {
          throw new BadRequestException('Insufficient SOL for transaction fees');
        }
        if (errorMessage.includes('insufficient funds for rent')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
        
        throw new BadRequestException(`Transfer failed: ${errorMessage}`);
      }
    } catch (error) {
      this.logger.error(`Error creating swap order: ${error.message}`);
      
      const errorMessage = error.message || '';
      if (errorMessage.includes('Simulation failed')) {
        if (errorMessage.includes('insufficient lamports')) {
          throw new BadRequestException('ATA creation fee is 0.0025 SOL');
        }
        if (errorMessage.includes('insufficient funds for rent')) {
          throw new BadRequestException('Insufficient SOL balance');
        }
      }
      
      throw new BadRequestException(error.message);
    }
  }

  async findByWalletId(walletId: number): Promise<SwapOrder[]> {
    return this.swapOrderRepository.find({
      where: { 
        wallet_id: walletId,
        status: SwapOrderStatus.COMPLETED 
      },
      order: { created_at: 'DESC' }
    });
  }

  async initWeb3Wallet(dto: InitWeb3WalletDto, wallet: any): Promise<{ orderId: number; serializedTx: string }> {
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
      let outputAmount: number;
      if (dto.outputToken === OutputTokenType.MMP) {
        outputAmount = Math.floor(usdValue / this.MMP01_PRICE_USD);
      } else if (dto.outputToken === OutputTokenType.MPB) {
        outputAmount = Math.floor(usdValue / this.MPB_PRICE_USD);
      } else {
        throw new BadRequestException(`Unsupported output token type: ${dto.outputToken}`);
      }

      // 6. Tạo và lưu swap order với trạng thái PENDING
      const swapOrder = this.swapOrderRepository.create({
        wallet_id: wallet.id, // Sử dụng wallet_id từ JWT
        input_token: dto.inputToken,
        output_token: dto.outputToken,
        input_amount: dto.inputAmount,
        swap_rate: usdValue / dto.inputAmount,
        status: SwapOrderStatus.PENDING
      });

      const savedOrder = await this.swapOrderRepository.save(swapOrder);

      // 7. Tạo transaction để chuyển token
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
              transferAmount // Sử dụng số nguyên đã chuyển đổi
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
      let txDetail = null;
      let retryCount = 0;
      const maxRetries = 2;
      const retryDelay = 1200; // 1.2 seconds

      while (retryCount <= maxRetries) {
        txDetail = await this.connection.getTransaction(dto.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });

        if (txDetail) {
          break;
        }

        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryCount++;
        } else {
          throw new BadRequestException('Transaction not found on blockchain after retries');
        }
      }

      if (!txDetail) {
        throw new BadRequestException('Transaction not found on blockchain');
      }

      if (!txDetail.transaction) {
        throw new BadRequestException('Invalid transaction data');
      }

      // 3. Verify signatures
      try {
        const signatures = txDetail.transaction.signatures;
        if (!signatures || signatures.length === 0) {
          throw new BadRequestException('Transaction has no signatures');
        }
        
        if (txDetail.meta && txDetail.meta.err) {
          throw new BadRequestException('Transaction failed on blockchain');
        }
      } catch (error) {
        throw new BadRequestException('Invalid transaction signatures');
      }

      // 4. Validate transaction fields
      const accountKeys = txDetail.transaction.message.getAccountKeys();
      const accountKeysArray = accountKeys.keySegments().flat();
      
      if (!accountKeysArray || accountKeysArray.length === 0) {
        throw new BadRequestException('Invalid transaction: no account keys found');
      }

      // Get fee payer (first signer) from transaction
      const feePayerIndex = txDetail.transaction.message.header.numRequiredSignatures - 1;
      const userPublicKey = accountKeysArray[feePayerIndex];
      
      if (!userPublicKey) {
        throw new BadRequestException('Invalid transaction: user public key not found');
      }

      const destinationWallet = this.configService.get('DESTINATION_WALLET');
      if (!destinationWallet) {
        throw new BadRequestException('System configuration error: destination wallet not set');
      }

      if (!txDetail.transaction.message.header.numRequiredSignatures) {
        throw new BadRequestException('Transaction missing required signatures');
      }

      // 5. Validate instruction chi tiết
      let isValidInstruction = false;
      let actualAmount = 0;
      let actualMint = '';

      // Kiểm tra thay đổi balance
      if (txDetail.meta && txDetail.meta.preBalances && txDetail.meta.postBalances) {
        const preBalances = txDetail.meta.preBalances;
        const postBalances = txDetail.meta.postBalances;
        
        // Tìm account có thay đổi balance
        for (let i = 0; i < preBalances.length; i++) {
          const preBalance = preBalances[i];
          const postBalance = postBalances[i];
          const accountKey = accountKeysArray[i];
          
          if (preBalance !== postBalance) {
            // Nếu là SOL transfer
            if (order.input_token === TokenType.SOL) {
              const balanceChange = (preBalance - postBalance) / 1e9; // Convert lamports to SOL
              
              // Kiểm tra nếu account là destination wallet
              if (accountKey.toString() === destinationWallet) {
                actualAmount = balanceChange;
                isValidInstruction = true;
                break;
              }
            }
          }
        }
      }

      // Nếu chưa tìm thấy qua balance changes, kiểm tra instructions
      if (!isValidInstruction) {
        const message = txDetail.transaction.message;
        const instructions = message.compiledInstructions || [];
        const innerInstructions = txDetail.meta?.innerInstructions || [];

        // Hàm helper để xử lý instruction
        const processInstruction = async (instruction: any, isInner: boolean = false) => {
          const programIdIndex = instruction.programIdIndex;
          if (programIdIndex === undefined) return false;

          const programId = accountKeysArray[programIdIndex];
          if (!programId) return false;
          
          if (programId.equals(SystemProgram.programId)) {
            // SOL transfer instruction
            const transferData = instruction.data;
            if (transferData && transferData.length === 9 && transferData[0] === 2) {
              const lamportsBuffer = transferData.slice(1, 9);
              const lamports = lamportsBuffer.reduce((acc, byte, index) => acc + byte * Math.pow(256, index), 0);
              actualAmount = lamports / 1e9;
              
              const toPubkeyIndex = instruction.accountKeyIndexes[1];
              if (toPubkeyIndex === undefined) return false;

              const toPubkey = accountKeysArray[toPubkeyIndex];
              if (!toPubkey) return false;

              if (toPubkey.toString() === destinationWallet) {
                return true;
              }
            }
          } else if (programId.equals(TOKEN_PROGRAM_ID)) {
            // SPL token transfer instruction
            const transferData = instruction.data;
            if (transferData && transferData.length === 9 && transferData[0] === 3) {
              const amountBuffer = transferData.slice(1, 9);
              const amount = amountBuffer.reduce((acc, byte, index) => acc + byte * Math.pow(256, index), 0);
              
              const sourceAccountIndex = instruction.accountKeyIndexes[1];
              const destinationAccountIndex = instruction.accountKeyIndexes[2];
              
              if (sourceAccountIndex === undefined || destinationAccountIndex === undefined) return false;

              const sourceAccount = accountKeysArray[sourceAccountIndex];
              const destinationAccount = accountKeysArray[destinationAccountIndex];
              
              if (!sourceAccount || !destinationAccount) return false;

              // Get token account info to verify mint
              try {
                const sourceAccountInfo = await this.connection.getParsedAccountInfo(sourceAccount);
                if (sourceAccountInfo.value && 'parsed' in sourceAccountInfo.value.data) {
                  const tokenAccountData = sourceAccountInfo.value.data.parsed.info;
                  actualMint = tokenAccountData.mint;
                  
                  const expectedMint = this.TOKEN_MINT_ADDRESSES[order.input_token];
                  if (actualMint === expectedMint) {
                    const decimals = tokenAccountData.tokenAmount.decimals;
                    actualAmount = amount / Math.pow(10, decimals);
                    return true;
                  }
                }
              } catch (error) {
                return false;
              }
            }
          }
          return false;
        };

        // Xử lý main instructions
        for (const instruction of instructions) {
          const isValid = await processInstruction(instruction);
          if (isValid) {
            isValidInstruction = true;
            break;
          }
        }

        // Nếu không tìm thấy trong main instructions, kiểm tra inner instructions
        if (!isValidInstruction) {
          for (const innerInstructionGroup of innerInstructions) {
            for (const instruction of innerInstructionGroup.instructions) {
              const isValid = await processInstruction(instruction, true);
              if (isValid) {
                isValidInstruction = true;
                break;
              }
            }
            if (isValidInstruction) break;
          }
        }
      }

      if (!isValidInstruction) {
        throw new BadRequestException('Invalid transfer instruction in transaction');
      }

      // 6. Kiểm tra amount
      const tolerance = 0.000001;
      // if (Math.abs(actualAmount - order.input_amount) > tolerance) {
      //   throw new BadRequestException(`Amount mismatch: expected ${order.input_amount}, got ${actualAmount}`);
      // }

      // 7. Tính toán giá trị USD và gửi token
      const usdValue = await this.calculateUSDValue(order.input_token, order.input_amount);
      let outputTxHash: string;

      if (order.output_token === OutputTokenType.MMP) {
        outputTxHash = await this.sendMMP01Tokens(userPublicKey.toString(), usdValue);
        order.mmp_received = usdValue / this.MMP01_PRICE_USD;
      } else if (order.output_token === OutputTokenType.MPB) {
        outputTxHash = await this.sendMPBTokens(userPublicKey.toString(), usdValue);
        order.mpb_received = usdValue / this.MPB_PRICE_USD;
      } else {
        throw new BadRequestException(`Unsupported output token type: ${order.output_token}`);
      }

      // 8. Cập nhật order
      order.status = SwapOrderStatus.COMPLETED;
      order.tx_hash_send = dto.signature;
      order.tx_hash_ref = outputTxHash;
      await this.swapOrderRepository.save(order);

      // 9. Tạo referral reward nếu có người giới thiệu
      this.referralRewardService.createReferralReward(order, this.solPriceCache.price)
        .catch(error => this.logger.error(`Failed to create referral reward: ${error.message}`));

      return order;
    } catch (error) {
      this.logger.error(`Error completing web3 wallet: ${error.message}`);
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