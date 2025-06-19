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

      // Tính toán phần thưởng (theo tỷ lệ rewardRate của số lượng token mà user nhận được)
      let rewardAmount: number;
      switch (swapOrder.output_token) {
        case 'MMP':
          rewardAmount = swapOrder.mmp_received ? swapOrder.mmp_received * rewardRate : 0;
          break;
        case 'MPB':
          rewardAmount = swapOrder.mpb_received ? swapOrder.mpb_received * rewardRate : 0;
          break;
        default:
          // Fallback: tính theo giá trị USD nếu không có số lượng token nhận được
          const usdValue = swapOrder.input_amount * swapOrder.swap_rate;
          rewardAmount = usdValue * rewardRate;
          break;
      }

      // Chọn loại token thưởng (có thể dựa vào output_token của swap hoặc config)

      // Tạo referral reward cho token
      const tokenReferralReward = this.referralRewardRepository.create({
        referrer_wallet_id: referrerWallet.id,
        referred_wallet_id: referredWallet.id,
        swap_order_id: swapOrder.id,
        reward_amount: rewardAmount,
        reward_token: swapOrder.output_token,
        status: RewardStatus.PENDING
      });

      const savedTokenReward = await this.referralRewardRepository.save(tokenReferralReward);

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
      await this.payReferralReward(savedTokenReward.id);
      if (savedSolReward) {
        await this.payReferralReward(savedSolReward.id);
      }

      return savedTokenReward;

    } catch (error) {
      console.error('Error creating referral reward:', error);
      return null;
    }
  }


  // Thanh toán referral reward (gửi token MMP hoặc MPB hoặc SOL)
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
        case 'MPB':
          txHash = await this.sendMPBToReferrer(reward.referrer_wallet.sol_address, reward.reward_amount);
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

  async findByWalletId(walletId: number): Promise<ReferralReward[]> {
    return this.referralRewardRepository.find({
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
      order: { created_at: 'DESC' }
    });
  }

} 