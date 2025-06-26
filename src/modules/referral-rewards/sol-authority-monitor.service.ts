import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Commitment, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralReward, RewardStatus } from './referral-reward.entity';
import { Wallet } from '../wallets/wallet.entity';
import bs58 from 'bs58';
import { getAssociatedTokenAddress, createTransferInstruction, getMint } from '@solana/spl-token';
import { SystemProgram, Transaction } from '@solana/web3.js';

@Injectable()
export class SolAuthorityMonitorService implements OnModuleInit {
  private readonly logger = new Logger(SolAuthorityMonitorService.name);
  private readonly wsConnection: Connection;
  private readonly solAuthorityKeypair: Keypair;
  private readonly mmpAuthorityKeypair: Keypair;
  private readonly mmpMint: PublicKey;
  private previousBalance: number = 0;
  private logSubscriptionId: number;
  private accountSubscriptionId: number;
  private lastProcessedSlot: number = 0;
  private readonly commitment: Commitment = 'confirmed';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ReferralReward)
    private readonly referralRewardRepository: Repository<ReferralReward>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {
    // Chỉ sử dụng WebSocket connection
    const wsUrl = this.configService.get<string>('SOLANA_WSS_URL').replace('wss://', 'https://');
    this.wsConnection = new Connection(wsUrl, this.commitment);
    
    const solAuthorityPrivateKey = this.configService.get<string>('SOL_AUTHORITY_PRIVATE_KEY');
    this.solAuthorityKeypair = Keypair.fromSecretKey(bs58.decode(solAuthorityPrivateKey));
    
    const mmpAuthorityPrivateKey = this.configService.get<string>('MMP_AUTHORITY_PRIVATE_KEY');
    this.mmpAuthorityKeypair = Keypair.fromSecretKey(bs58.decode(mmpAuthorityPrivateKey));
    
    this.mmpMint = new PublicKey(this.configService.get<string>('MMP_MINT'));

    // Khởi tạo lastProcessedSlot
    this.initializeLastProcessedSlot();
  }

  private async initializeLastProcessedSlot() {
    try {
      const slot = await this.wsConnection.getSlot(this.commitment);
      this.lastProcessedSlot = slot;
    } catch (error) {
      this.logger.error(`Error initializing last processed slot: ${error.message}`);
    }
  }

  private async getLatestSlot(): Promise<number> {
    try {
      return await this.wsConnection.getSlot(this.commitment);
    } catch (error) {
      this.logger.error(`Error getting latest slot: ${error.message}`);
      return this.lastProcessedSlot;
    }
  }

  private async waitForLatestSlot(): Promise<void> {
    const maxRetries = 3;
    let retries = 0;
    let lastSlot = this.lastProcessedSlot;
    
    while (retries < maxRetries) {
      const currentSlot = await this.getLatestSlot();
      if (currentSlot > lastSlot) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const finalSlot = await this.getLatestSlot();
        if (finalSlot === currentSlot) {
          this.lastProcessedSlot = currentSlot;
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }
  }

  onModuleInit() {
    this.logger.log('SolAuthorityMonitorService initialized');
    this.startMonitoring();
  }

  private async startMonitoring(): Promise<void> {
    try {
      // Lấy số dư ban đầu
      this.previousBalance = await this.wsConnection.getBalance(this.solAuthorityKeypair.publicKey);
      this.logger.log(`Starting SOL authority balance monitoring. Current balance: ${this.previousBalance / LAMPORTS_PER_SOL} SOL`);
      
      // Đăng ký lắng nghe logs cho ví authority
      this.logSubscriptionId = this.wsConnection.onLogs(
        this.solAuthorityKeypair.publicKey,
        async (logs) => {
          if (logs.err) return; // Bỏ qua nếu có lỗi

          try {
            // Đợi slot mới nhất
            await this.waitForLatestSlot();
            
            // Kiểm tra số dư mới
            const currentBalance = await this.wsConnection.getBalance(this.solAuthorityKeypair.publicKey);
            const currentBalanceSOL = currentBalance / LAMPORTS_PER_SOL;
            const previousBalanceSOL = this.previousBalance / LAMPORTS_PER_SOL;
            
            this.logger.log(`SOL Authority balance: ${currentBalanceSOL} SOL (previous: ${previousBalanceSOL} SOL)`);
            
            // Nếu số dư tăng, thực hiện trả thưởng WAIT_BALANCE
            if (currentBalance > this.previousBalance) {
              const increaseAmount = (currentBalance - this.previousBalance) / LAMPORTS_PER_SOL;
              this.logger.log(`SOL Authority balance increased by ${increaseAmount} SOL. Processing WAIT_BALANCE rewards...`);
              await this.processWAIT_BALANCERewards();
              this.previousBalance = currentBalance;
            }
          } catch (error) {
            this.logger.error('Error processing balance change:', error);
          }
        },
        this.commitment
      );

      // Đăng ký lắng nghe thay đổi account cho ví authority
      this.accountSubscriptionId = this.wsConnection.onAccountChange(
        this.solAuthorityKeypair.publicKey,
        async () => {
          try {
            // Đợi slot mới nhất
            await this.waitForLatestSlot();
            
            // Kiểm tra số dư mới
            const currentBalance = await this.wsConnection.getBalance(this.solAuthorityKeypair.publicKey);
            const currentBalanceSOL = currentBalance / LAMPORTS_PER_SOL;
            const previousBalanceSOL = this.previousBalance / LAMPORTS_PER_SOL;
            
            this.logger.log(`SOL Authority balance: ${currentBalanceSOL} SOL (previous: ${previousBalanceSOL} SOL)`);
            
            // Nếu số dư tăng, thực hiện trả thưởng WAIT_BALANCE
            if (currentBalance > this.previousBalance) {
              const increaseAmount = (currentBalance - this.previousBalance) / LAMPORTS_PER_SOL;
              this.logger.log(`SOL Authority balance increased by ${increaseAmount} SOL. Processing WAIT_BALANCE rewards...`);
              await this.processWAIT_BALANCERewards();
              this.previousBalance = currentBalance;
            }
          } catch (error) {
            this.logger.error('Error processing account change:', error);
          }
        },
        this.commitment
      );
      
      this.logger.log('Logs and account change listeners registered for SOL authority wallet');
      
    } catch (error) {
      this.logger.error('Error starting SOL authority balance monitoring:', error);
    }
  }

  private async processWAIT_BALANCERewards(): Promise<void> {
    try {
      // Lấy tất cả reward có status WAIT_BALANCE
      const waitBalanceRewards = await this.referralRewardRepository.find({
        where: { status: RewardStatus.WAIT_BALANCE },
        relations: ['referrer_wallet']
      });

      if (waitBalanceRewards.length === 0) {
        this.logger.log('No WAIT_BALANCE rewards found');
        return;
      }

      this.logger.log(`Found ${waitBalanceRewards.length} WAIT_BALANCE rewards to process`);

      // Nhóm theo wallet và token type để xử lý hàng loạt
      const rewardsByWallet = new Map<string, ReferralReward[]>();
      
      for (const reward of waitBalanceRewards) {
        const key = `${reward.referrer_wallet_id}_${reward.reward_token}`;
        if (!rewardsByWallet.has(key)) {
          rewardsByWallet.set(key, []);
        }
        rewardsByWallet.get(key)!.push(reward);
      }

      // Xử lý từng nhóm
      for (const [key, rewards] of rewardsByWallet) {
        try {
          const [walletId, tokenType] = key.split('_');
          const totalAmount = rewards.reduce((sum, reward) => sum + parseFloat(reward.reward_amount.toString()), 0);
          
          this.logger.log(`Processing ${rewards.length} ${tokenType} rewards for wallet ${walletId}, total amount: ${totalAmount}`);

          // Gửi token
          let txHash: string;
          switch (tokenType) {
            case 'SOL':
              txHash = await this.sendSOLToReferrer(rewards[0].referrer_wallet.sol_address, totalAmount);
              break;
            // case 'MMP':
            //   txHash = await this.sendMMPToReferrer(rewards[0].referrer_wallet.sol_address, totalAmount);
            //   break;
            default:
              this.logger.log(`Unsupported token type: ${tokenType}`);
              continue;
          }

          // Cập nhật trạng thái tất cả reward trong nhóm
          for (const reward of rewards) {
            reward.status = RewardStatus.PAID;
            reward.tx_hash = txHash;
            await this.referralRewardRepository.save(reward);
          }

          this.logger.log(`Successfully paid ${totalAmount} ${tokenType} to wallet ${walletId}`);

        } catch (error) {
          this.logger.error(`Error processing rewards for key ${key}:`, error);
          
          // Cập nhật trạng thái thành FAILED nếu có lỗi
          for (const reward of rewards) {
            reward.status = RewardStatus.FAILED;
            await this.referralRewardRepository.save(reward);
          }
        }
      }

    } catch (error) {
      this.logger.error('Error processing WAIT_BALANCE rewards:', error);
    }
  }

  // Gửi SOL cho người giới thiệu
  private async sendSOLToReferrer(toAddress: string, amount: number): Promise<string> {
    const toPublicKey = new PublicKey(toAddress);
    const authorityPublicKey = this.solAuthorityKeypair.publicKey;
    
    // Chuyển đổi SOL sang lamports (1 SOL = 10^9 lamports)
    const lamports = Math.floor(amount * 1e9);
    
    const instructions = [
      SystemProgram.transfer({
        fromPubkey: authorityPublicKey,
        toPubkey: toPublicKey,
        lamports: lamports
      })
    ];

    const tx = new Transaction().add(...instructions);
    tx.feePayer = authorityPublicKey;
    const { blockhash } = await this.wsConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Ký và gửi transaction
    const signature = await this.wsConnection.sendTransaction(tx, [this.solAuthorityKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    // Đợi xác nhận
    await this.wsConnection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  // Gửi MMP cho người giới thiệu
  private async sendMMPToReferrer(toAddress: string, amount: number): Promise<string> {
    const mint = new PublicKey(this.mmpMint);
    const decimals = (await getMint(this.wsConnection, mint)).decimals;
    const toPublicKey = new PublicKey(toAddress);
    const authorityPublicKey = this.mmpAuthorityKeypair.publicKey;

    // Lấy ATA cho người nhận
    const toTokenAccount = await getAssociatedTokenAddress(mint, toPublicKey);
    const instructions = [];

    // Lấy ATA của authority
    const fromTokenAccount = await getAssociatedTokenAddress(mint, authorityPublicKey);
    const transferAmount = Math.floor(amount * Math.pow(10, decimals));
    instructions.push(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        authorityPublicKey,
        transferAmount
      )
    );

    const tx = new Transaction().add(...instructions);
    tx.feePayer = authorityPublicKey;
    const { blockhash } = await this.wsConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Ký và gửi transaction
    const signature = await this.wsConnection.sendTransaction(tx, [this.mmpAuthorityKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    // Đợi xác nhận
    await this.wsConnection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  // Phương thức để dừng monitoring (có thể gọi khi shutdown)
  stopMonitoring(): void {
    if (this.logSubscriptionId) {
      this.wsConnection.removeOnLogsListener(this.logSubscriptionId);
      this.logger.log('SOL authority logs listener stopped');
    }
    if (this.accountSubscriptionId) {
      this.wsConnection.removeAccountChangeListener(this.accountSubscriptionId);
      this.logger.log('SOL authority account change listener stopped');
    }
  }

  // Phương thức để lấy thông tin monitoring hiện tại
  getMonitoringStatus(): { isActive: boolean; currentBalance: number; previousBalance: number } {
    return {
      isActive: !!(this.logSubscriptionId || this.accountSubscriptionId),
      currentBalance: this.previousBalance / LAMPORTS_PER_SOL,
      previousBalance: this.previousBalance / LAMPORTS_PER_SOL
    };
  }
} 