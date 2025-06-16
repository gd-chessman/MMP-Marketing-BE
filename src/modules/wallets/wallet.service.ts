import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './wallet.entity';
import { UserService } from '../users/user.service';
import { Connection, PublicKey } from '@solana/web3.js';
import { ConfigService } from '@nestjs/config';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly connection: Connection;
  private readonly USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private userService: UserService,
    private configService: ConfigService,
  ) {
    this.connection = new Connection(this.configService.get('SOLANA_RPC_URL'));
  }

  async findOne(id: number): Promise<Wallet> {
    try {
      const wallet = await this.walletRepository.findOne({ 
        where: { id },
        relations: ['user']
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet with id ${id} not found`);
      }

      if (!wallet.sol_address) {
        throw new BadRequestException('Wallet address is not set');
      }

      try {
        // Get SOL balance
        const solBalance = await this.connection.getBalance(
          new PublicKey(wallet.sol_address)
        );
        wallet.balance_sol = solBalance / 1e9; // Convert lamports to SOL

        // Get MMP token balance
        const mmpMintAddress = this.configService.get('MMP_MINT');
        if (!mmpMintAddress) {
          this.logger.warn('MMP token mint address is not configured, skipping MMP balance check');
          wallet.balance_mmp = 0;
        } else {
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            new PublicKey(wallet.sol_address),
            { mint: new PublicKey(mmpMintAddress) }
          );

          if (tokenAccounts.value.length > 0) {
            const tokenBalance = await this.connection.getTokenAccountBalance(
              tokenAccounts.value[0].pubkey
            );
            wallet.balance_mmp = tokenBalance.value.uiAmount || 0;
          } else {
            wallet.balance_mmp = 0;
          }
        }

        // Get USDT token balance
        const tokenAccounts = await this.connection.getTokenAccountsByOwner(
          new PublicKey(wallet.sol_address),
          { mint: new PublicKey(this.USDT_MINT) }
        );

        if (tokenAccounts.value.length > 0) {
          const tokenBalance = await this.connection.getTokenAccountBalance(
            tokenAccounts.value[0].pubkey
          );
          wallet.balance_usdt = tokenBalance.value.uiAmount || 0;
        } else {
          wallet.balance_usdt = 0;
        }

        // Get USDC token balance
        const usdcTokenAccounts = await this.connection.getTokenAccountsByOwner(
          new PublicKey(wallet.sol_address),
          { mint: new PublicKey(this.USDC_MINT) }
        );

        if (usdcTokenAccounts.value.length > 0) {
          const tokenBalance = await this.connection.getTokenAccountBalance(
            usdcTokenAccounts.value[0].pubkey
          );
          wallet.balance_usdc = tokenBalance.value.uiAmount || 0;
        } else {
          wallet.balance_usdc = 0;
        }

        // Get MPB token balance
        const mpbMintAddress = this.configService.get('MPB_MINT');
        if (!mpbMintAddress) {
          this.logger.warn('MPB token mint address is not configured, skipping MPB balance check');
          wallet.balance_mpb = 0;
        } else {
          const mpbTokenAccounts = await this.connection.getTokenAccountsByOwner(
            new PublicKey(wallet.sol_address),
            { mint: new PublicKey(mpbMintAddress) }
          );

          if (mpbTokenAccounts.value.length > 0) {
            const tokenBalance = await this.connection.getTokenAccountBalance(
              mpbTokenAccounts.value[0].pubkey
            );
            wallet.balance_mpb = tokenBalance.value.uiAmount || 0;
          } else {
            wallet.balance_mpb = 0;
          }
        }

        // Save updated balances to database
        return this.walletRepository.save(wallet);
      } catch (error) {
        this.logger.error(`Error getting blockchain data: ${error.message}`);
        // Return wallet without updated balances if blockchain query fails
        return wallet;
      }
    } catch (error) {
      this.logger.error(`Error in findOne: ${error.message}`);
      throw error;
    }
  }
} 