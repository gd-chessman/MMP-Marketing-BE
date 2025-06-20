import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ReferralReward, RewardStatus } from './referral-reward.entity';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrder } from '../swap-orders/swap-order.entity';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getMint, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import { WalletType } from '../wallets/wallet.entity';
import { ReferralStatisticsDto, ReferredWalletDto } from './dto/referral-statistics.dto';

@Injectable()
export class ReferralRewardService {
  private readonly connection: Connection;
  private readonly mmpAuthorityKeypair: Keypair;

  constructor(
    @InjectRepository(ReferralReward)
    private readonly referralRewardRepository: Repository<ReferralReward>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(SwapOrder)
    private readonly swapOrderRepository: Repository<SwapOrder>,
    private readonly configService: ConfigService,
  ) {
    this.connection = new Connection(this.configService.get('SOLANA_RPC_URL'));
    const mmpAuthorityPrivateKey = this.configService.get<string>('MMP_AUTHORITY_PRIVATE_KEY');
    this.mmpAuthorityKeypair = Keypair.fromSecretKey(bs58.decode(mmpAuthorityPrivateKey));
  }

  // Tạo referral reward khi swap thành công
  async createReferralReward(swapOrder: SwapOrder, priceSolUSD?: number): Promise<ReferralReward | null> {
    try {
      // Lấy thông tin ví của người thực hiện swap
      const referredWallet = await this.walletRepository.findOne({
        where: { id: swapOrder.wallet_id }
      });

      if (!referredWallet || !referredWallet.referred_by) {
        return null; // Không có người giới thiệu
      }

      // Tìm ví của người giới thiệu
      const referrerWallet = await this.walletRepository.findOne({
        where: { referral_code: referredWallet.referred_by }
      });

      if (!referrerWallet) {
        return null; // Không tìm thấy ví người giới thiệu
      }

      // Kiểm tra xem đã có referral reward cho swap order này chưa
      const existingReward = await this.referralRewardRepository.findOne({
        where: { swap_order_id: swapOrder.id }
      });

      if (existingReward) {
        return existingReward; // Đã có rồi
      }

      // Xác định tỷ lệ thưởng dựa vào loại ví người giới thiệu
      let rewardRate = 0.05;
      if (referrerWallet.wallet_type === WalletType.BJ) {
        rewardRate = 0.10;
      }

      // Tính toán phần thưởng MMP (theo tỷ lệ rewardRate của số lượng token mà user nhận được)
      let rewardAmount: number;
      switch (swapOrder.output_token) {
        case 'MMP':
          rewardAmount = swapOrder.mmp_received ? swapOrder.mmp_received * rewardRate : 0;
          break;
        case 'MPB':
          // Nếu output là MPB, vẫn tính thưởng MMP dựa trên số lượng MPB nhận được
          rewardAmount = swapOrder.mpb_received ? swapOrder.mpb_received * rewardRate : 0;
          break;
        default:
          // Fallback: tính theo giá trị USD nếu không có số lượng token nhận được
          const usdValue = swapOrder.input_amount * swapOrder.swap_rate;
          rewardAmount = usdValue * rewardRate;
          break;
      }

      // Tạo referral reward cho MMP (luôn là MMP bất kể output token là gì)
      const mmpReferralReward = this.referralRewardRepository.create({
        referrer_wallet_id: referrerWallet.id,
        referred_wallet_id: referredWallet.id,
        swap_order_id: swapOrder.id,
        reward_amount: rewardAmount,
        reward_token: 'MMP', // Luôn là MMP
        status: RewardStatus.PENDING
      });

      const savedMmpReward = await this.referralRewardRepository.save(mmpReferralReward);

      // Tạo referral reward cho SOL/USDT/USDC dựa vào input_token
      let savedSolReward = null;
      switch (swapOrder.input_token) {
        case 'SOL':
          const solRewardAmount = swapOrder.input_amount * rewardRate;
          
          const solReferralReward = this.referralRewardRepository.create({
            referrer_wallet_id: referrerWallet.id,
            referred_wallet_id: referredWallet.id,
            swap_order_id: swapOrder.id,
            reward_amount: solRewardAmount,
            reward_token: swapOrder.input_token,
            status: RewardStatus.PENDING
          });

          savedSolReward = await this.referralRewardRepository.save(solReferralReward);
          break;
        case 'USDT':
        case 'USDC':
          // Quy đổi USDT/USDC sang SOL với tỷ giá 1 SOL = $
          const usdValue = swapOrder.input_amount; // USDT/USDC có giá trị 1:1 với USD
          const solEquivalent = usdValue / priceSolUSD; // 
          const usdtUsdcRewardAmount = solEquivalent * rewardRate;
          
          const usdtUsdcReferralReward = this.referralRewardRepository.create({
            referrer_wallet_id: referrerWallet.id,
            referred_wallet_id: referredWallet.id,
            swap_order_id: swapOrder.id,
            reward_amount: usdtUsdcRewardAmount,
            reward_token: 'SOL', // Thưởng bằng SOL thay vì USDT/USDC
            status: RewardStatus.PENDING
          });

          savedSolReward = await this.referralRewardRepository.save(usdtUsdcReferralReward);
          break;
        default:
          // Không tạo reward cho các token khác
          break;
      }

      // Tự động thanh toán referral rewards
      // SOL luôn được thanh toán ngay lập tức
      if (savedSolReward) {
        await this.payReferralReward(savedSolReward.id);
      }

      // Kiểm tra và thanh toán MMP nếu đạt ngưỡng 5,000
      await this.checkAndPayTokenReward(referrerWallet.id, 'MMP');

      return savedMmpReward;

    } catch (error) {
      console.error('Error creating referral reward:', error);
      return null;
    }
  }

  // Kiểm tra và thanh toán thưởng MMP khi đạt ngưỡng 5,000
  private async checkAndPayTokenReward(walletId: number, tokenType: string): Promise<void> {
    try {
      // Chỉ xử lý MMP
      if (tokenType !== 'MMP') {
        return;
      }

      // Tính tổng mmp_received từ swap_orders của người giới thiệu
      const totalTokenReceived = await this.swapOrderRepository
        .createQueryBuilder('swap')
        .where('swap.wallet_id = :walletId', { walletId })
        .andWhere('swap.output_token = :tokenType', { tokenType })
        .andWhere('swap.status = :status', { status: 'completed' })
        .select('SUM(swap.mmp_received)', 'total')
        .getRawOne();

      const totalAmount = parseFloat(totalTokenReceived?.total || '0');
      console.log(`Total ${tokenType} received by referrer:`, totalAmount);

      // Nếu đạt ngưỡng 5,000, thanh toán tất cả thưởng tích lũy
      if (totalAmount >= 5000) {
        await this.payAllPendingRewards(walletId, tokenType);
      }
    } catch (error) {
      console.error('Error checking token reward:', error);
    }
  }

  // Thanh toán tất cả thưởng chưa thanh toán cho một loại token
  private async payAllPendingRewards(walletId: number, tokenType: string): Promise<void> {
    try {
      // Chỉ xử lý MMP
      if (tokenType !== 'MMP') {
        return;
      }

      // Lấy tất cả thưởng chưa thanh toán
      const pendingRewards = await this.referralRewardRepository.find({
        where: {
          referrer_wallet_id: walletId,
          reward_token: tokenType,
          status: RewardStatus.PENDING
        },
        relations: ['referrer_wallet']
      });

      if (pendingRewards.length === 0) {
        return;
      }

      // Tính tổng số lượng thưởng
      const totalAmount = pendingRewards.reduce((sum, reward) => sum + parseFloat(reward.reward_amount.toString()), 0);

      // Gửi MMP
      const txHash = await this.sendMMPToReferrer(pendingRewards[0].referrer_wallet.sol_address, totalAmount);

      // Cập nhật trạng thái tất cả thưởng đã thanh toán
      for (const reward of pendingRewards) {
        reward.status = RewardStatus.PAID;
        reward.tx_hash = txHash;
        await this.referralRewardRepository.save(reward);
      }

      console.log(`Paid ${totalAmount} ${tokenType} tokens to wallet ${walletId}`);

    } catch (error) {
      console.error('Error paying pending rewards:', error);
      // Cập nhật trạng thái thành FAILED nếu có lỗi
      try {
        const pendingRewards = await this.referralRewardRepository.find({
          where: {
            referrer_wallet_id: walletId,
            reward_token: tokenType,
            status: RewardStatus.PENDING
          }
        });

        for (const reward of pendingRewards) {
          reward.status = RewardStatus.FAILED;
          await this.referralRewardRepository.save(reward);
        }
      } catch (updateError) {
        console.error('Failed to update reward status:', updateError);
      }
    }
  }

  // Thanh toán referral reward (gửi token MMP hoặc SOL)
  async payReferralReward(rewardId: number): Promise<boolean> {
    try {
      const reward = await this.referralRewardRepository.findOne({
        where: { id: rewardId },
        relations: ['referrer_wallet']
      });

      if (!reward || reward.status !== RewardStatus.PENDING) {
        return false;
      }

      // Gửi token thực tế dựa vào loại token
      let txHash: string;
      switch (reward.reward_token) {
        case 'MMP':
          txHash = await this.sendMMPToReferrer(reward.referrer_wallet.sol_address, reward.reward_amount);
          break;
        case 'SOL':
          txHash = await this.sendSOLToReferrer(reward.referrer_wallet.sol_address, reward.reward_amount);
          break;
        default:
          throw new Error(`Unsupported reward token: ${reward.reward_token}`);
      }

      reward.status = RewardStatus.PAID;
      reward.tx_hash = txHash;
      await this.referralRewardRepository.save(reward);

      console.log(`Referral reward ${rewardId} paid successfully with ${reward.reward_token}`);
      return true;

    } catch (error) {
      console.error('Error paying referral reward:', error);
      // Cập nhật trạng thái thành FAILED nếu có lỗi
      try {
        const reward = await this.referralRewardRepository.findOne({
          where: { id: rewardId }
        });
        if (reward) {
          reward.status = RewardStatus.FAILED;
          await this.referralRewardRepository.save(reward);
        }
      } catch (updateError) {
        console.error('Failed to update reward status:', updateError);
      }
      return false;
    }
  }

  // Gửi MMP cho người giới thiệu
  private async sendMMPToReferrer(toAddress: string, amount: number): Promise<string> {
    const mintAddress = this.configService.get<string>('MMP_MINT');
    const mint = new PublicKey(mintAddress);
    const decimals = (await getMint(this.connection, mint)).decimals;
    const toPublicKey = new PublicKey(toAddress);
    const authorityPublicKey = this.mmpAuthorityKeypair.publicKey;

    // Lấy ATA cho người nhận (không tạo nếu chưa có)
    const toTokenAccount = await getAssociatedTokenAddress(mint, toPublicKey);
    // const toTokenAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
    const instructions = [];
    // Không tạo ATA cho người nhận

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
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Ký và gửi transaction
    const signature = await this.connection.sendTransaction(tx, [this.mmpAuthorityKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    // Đợi xác nhận
    await this.connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  // Gửi MPB cho người giới thiệu
  private async sendMPBToReferrer(toAddress: string, amount: number): Promise<string> {
    const mintAddress = this.configService.get<string>('MPB_MINT');
    const mint = new PublicKey(mintAddress);
    const decimals = (await getMint(this.connection, mint)).decimals;
    const toPublicKey = new PublicKey(toAddress);
    const authorityPublicKey = this.mmpAuthorityKeypair.publicKey; // Dùng chung authority

    // Lấy ATA cho người nhận (không tạo nếu chưa có)
    const toTokenAccount = await getAssociatedTokenAddress(mint, toPublicKey);
    // const toTokenAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
    const instructions = [];
    // Không tạo ATA cho người nhận

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
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Ký và gửi transaction
    const signature = await this.connection.sendTransaction(tx, [this.mmpAuthorityKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    // Đợi xác nhận
    await this.connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  // Gửi SOL cho người giới thiệu
  private async sendSOLToReferrer(toAddress: string, amount: number): Promise<string> {
    const toPublicKey = new PublicKey(toAddress);
    const authorityPublicKey = this.mmpAuthorityKeypair.publicKey;
    
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
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Ký và gửi transaction
    const signature = await this.connection.sendTransaction(tx, [this.mmpAuthorityKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    // Đợi xác nhận
    await this.connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  async findByWalletId(walletId: number, page: number = 1, limit: number = 50): Promise<{ data: ReferralReward[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    
    const [data, total] = await this.referralRewardRepository.findAndCount({
      where: { referrer_wallet_id: walletId, status: RewardStatus.PAID },
      relations: ['referred_wallet'],
      select: {
        id: true,
        reward_amount: true,
        reward_token: true,
        status: true,
        tx_hash: true,
        created_at: true,
        referred_wallet: {
          sol_address: true
        }
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit
    });

    return {
      data,
      total,
      page,
      limit
    };
  }

  // Lấy thống kê referral rewards của một wallet
  async getReferralStatistics(walletId: number): Promise<ReferralStatisticsDto> {
    // Lấy tổng số người đã giới thiệu (unique referred wallets)
    const totalReferrals = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .select('COUNT(DISTINCT reward.referred_wallet_id)', 'count')
      .getRawOne();

    // Lấy thông tin chi tiết về những người đã được giới thiệu
    const referredWalletsData = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .leftJoin('reward.referred_wallet', 'referred_wallet')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .select([
        'DISTINCT referred_wallet.id as wallet_id',
        'referred_wallet.sol_address as sol_address',
        'referred_wallet.created_at as created_at'
      ])
      .getRawMany();

    // Tạo danh sách các ví đã được giới thiệu với thông tin reward
    const referredWallets: ReferredWalletDto[] = [];
    for (const walletData of referredWalletsData) {
      const referredWalletId = walletData.wallet_id;
      
      // Lấy tổng reward theo từng loại token từ người này
      const rewardStats = await this.referralRewardRepository
        .createQueryBuilder('reward')
        .where('reward.referrer_wallet_id = :walletId', { walletId })
        .andWhere('reward.referred_wallet_id = :referredWalletId', { referredWalletId })
        .andWhere('reward.status = :status', { status: RewardStatus.PAID })
        .select([
          'reward.reward_token as token',
          'SUM(reward.reward_amount) as total_amount'
        ])
        .groupBy('reward.reward_token')
        .getRawMany();

      // Khởi tạo giá trị mặc định
      let totalRewardSol = 0;
      let totalRewardMmp = 0;

      // Phân loại theo token type
      rewardStats.forEach(stat => {
        const amount = parseFloat(stat.total_amount);
        switch (stat.token) {
          case 'SOL':
            totalRewardSol = amount;
            break;
          case 'MMP':
            totalRewardMmp = amount;
            break;
        }
      });

      referredWallets.push({
        wallet_id: walletData.wallet_id,
        sol_address: walletData.sol_address,
        created_at: new Date(walletData.created_at),
        total_reward_sol: totalRewardSol,
        total_reward_mmp: totalRewardMmp,
        total_reward_mpb: 0 // Luôn là 0 vì không còn trả MPB
      });
    }

    const statistics: ReferralStatisticsDto = {
      total_referrals: parseInt(totalReferrals?.count || '0'),
      total_reward_sol: 0,
      total_reward_mmp: 0,
      total_reward_mpb: 0, // Luôn là 0 vì không còn trả MPB
      referred_wallets: referredWallets
    };

    // Phân loại theo token type
    referredWallets.forEach(wallet => {
      statistics.total_reward_sol += wallet.total_reward_sol;
      statistics.total_reward_mmp += wallet.total_reward_mmp;
      // total_reward_mpb luôn là 0
    });

    return statistics;
  }

} 