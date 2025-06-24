import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStake, UserStakeStatus } from './user-stake.entity';
import { CreateUserStakeDto } from './dto/create-user-stake.dto';
import { StakingPlan } from '../staking-plans/staking-plan.entity';
import { Wallet } from '../wallets/wallet.entity';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import bs58 from 'bs58';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as borsh from 'borsh';
import { sha256 } from 'js-sha256';
import { PrepareStakeDto } from './dto/prepare-stake.dto';
import { ExecuteStakeDto } from './dto/execute-stake.dto';
import { ExecuteUnstakeDto } from './dto/execute-unstake.dto';

class StakeInstruction {
  amount: bigint;
  lock_months: number;
  constructor(properties: { amount: bigint, lock_months: number }) {
    this.amount = properties.amount;
    this.lock_months = properties.lock_months;
  }
}

class StakeState {
  blacklist: PublicKey[];
  stake_counter: bigint;
  constructor(properties: { blacklist: PublicKey[], stake_counter: bigint }) {
    this.blacklist = properties.blacklist;
    this.stake_counter = properties.stake_counter;
  }
}

class UnstakeInstruction {
  stake_id: bigint;
  constructor(properties: { stake_id: bigint }) {
    this.stake_id = properties.stake_id;
  }
}

// Borsh schema for the 'stake' instruction arguments
const stakeInstructionSchema = new Map([
  [StakeInstruction, {
    kind: 'struct',
    fields: [
      ['amount', 'u64'],
      ['lock_months', 'u8'],
    ],
  }],
]);

const unstakeInstructionSchema = new Map([
  [UnstakeInstruction, {
    kind: 'struct',
    fields: [
      ['stake_id', 'u64'],
    ],
  }],
]);

const stakeStateSchema = new Map([
  [StakeState, {
    kind: 'struct',
    fields: [
      // We don't need to read the whole blacklist, just the counter.
      // But Borsh needs a full schema to deserialize. We can't easily skip variable-length fields.
      // The most robust way is to define the full schema.
      ['blacklist', ['string']], // This is a simplification and might not work for Pubkey vectors
      ['stake_counter', 'u64'],
    ],
  }],
]);

@Injectable()
export class UserStakeService {
  private connection: Connection;
  private programId: PublicKey;

  constructor(
    @InjectRepository(UserStake)
    private userStakeRepository: Repository<UserStake>,
    @InjectRepository(StakingPlan)
    private stakingPlanRepository: Repository<StakingPlan>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
    this.programId = new PublicKey(process.env.STAKING_PROGRAM_ID);
  }

  async create(walletId: number, createUserStakeDto: CreateUserStakeDto): Promise<UserStake> {
    const { staking_plan_id, amount_staked, lock_months } = createUserStakeDto;

    const wallet = await this.walletRepository.findOne({ where: { id: walletId }, select: ['id', 'private_key'] });
    if (!wallet || !wallet.private_key) {
      throw new NotFoundException(`Wallet with id ${walletId} not found or has no private key.`);
    }

    const stakingPlan = await this.stakingPlanRepository.findOne({ where: { id: staking_plan_id } });
    if (!stakingPlan) {
      throw new NotFoundException(`Staking plan with id ${staking_plan_id} not found`);
    }

    try {
      const userKeypair = Keypair.fromSecretKey(bs58.decode(wallet.private_key));
      const userPublicKey = userKeypair.publicKey;

      // Manually calculate PDAs
      const [stakeStatePDA] = await PublicKey.findProgramAddress(
        [Buffer.from("stake_state")],
        this.programId
      );
      
      // We need the stake_counter, so we still need to fetch and decode the stakeState account
      const stakeStateInfo = await this.connection.getAccountInfo(stakeStatePDA);
      if (!stakeStateInfo) {
        throw new BadRequestException(
          'Smart contract chưa được khởi tạo. Vui lòng liên hệ admin để khởi tạo stake state.'
        );
      }

      // NOTE: Manually decoding dynamic vectors with Borsh without a full schema is complex.
      // The previous attempt was flawed. The most reliable way without the full IDL-generated client
      // is to have a known, fixed layout.
      // Given the `lib.rs`, the layout is: 8-byte discriminator, 4-byte vec length, N*32-byte vec data, 8-byte u64 counter.
      const data = stakeStateInfo.data.slice(8); // Skip discriminator
      const blacklistLen = data.readUInt32LE(0);
      const stakeCounterOffset = 4 + blacklistLen * 32;
      const stakeCounter = data.readBigUInt64LE(stakeCounterOffset);

      const stakeCounterBuffer = Buffer.alloc(8);
      stakeCounterBuffer.writeBigUInt64LE(stakeCounter);

      const [userStakePDA] = await PublicKey.findProgramAddress(
        [Buffer.from("user_stake"), userPublicKey.toBuffer(), stakeCounterBuffer],
        this.programId
      );
      
      const allowedTokenMint = new PublicKey(process.env.MMP_TOKEN_MINT || "FrbqVX4esWyfA4PvZngXKvbPenzMV7XVdLw6JdQMpTSC");
      const userTokenAccount = await getAssociatedTokenAddress(allowedTokenMint, userPublicKey);
      
      // Kiểm tra số dư MMP token trước khi stake
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(userTokenAccount);
      const userMMPBalance = tokenAccountInfo.value.uiAmount || 0;
      const MMP_TOKEN_DECIMALS = 6;
      const amountToStake = BigInt(amount_staked * (10 ** MMP_TOKEN_DECIMALS));
      
      if (userMMPBalance < amount_staked) {
        throw new BadRequestException(
          `Insufficient MMP tokens. Your balance: ${userMMPBalance} MMP, Required: ${amount_staked} MMP`
        );
      }
      
      const [vaultPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        this.programId
      );
      
      // Create instruction data
      const discriminator = Buffer.from(sha256.digest('global:stake')).slice(0, 8);
      const instructionArgs = new StakeInstruction({ amount: amountToStake, lock_months });
      const instructionData = Buffer.concat([discriminator, borsh.serialize(stakeInstructionSchema, instructionArgs)]);

      const txInstruction = new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: userPublicKey, isSigner: true, isWritable: true },
          { pubkey: stakeStatePDA, isSigner: false, isWritable: true },
          { pubkey: userStakePDA, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: vaultPDA, isSigner: false, isWritable: true },
          { pubkey: vaultPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      const transaction = new Transaction().add(txInstruction);
      const txSignature = await this.connection.sendTransaction(transaction, [userKeypair]);

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + lock_months);

      const newUserStake = this.userStakeRepository.create({
        wallet_id: walletId,
        staking_plan_id,
        stake_id: Number(stakeCounter),
        stake_account_pda: userStakePDA.toBase58(),
        staking_tx_signature: txSignature,
        amount_staked,
        start_date: startDate,
        end_date: endDate,
        status: UserStakeStatus.ACTIVE,
      });

      return await this.userStakeRepository.save(newUserStake);

    } catch (error) {
      console.error('Failed to stake:', error);
      
      // Kiểm tra lỗi insufficient lamports để hiển thị thông báo rõ ràng
      if (error.message && error.message.includes('insufficient lamports')) {
        throw new BadRequestException(
          'Your wallet does not have enough SOL to create a new stake account. You need at least 0.002 SOL to pay for account creation fees. Please add more SOL to your wallet.'
        );
      }
      
      // Kiểm tra các lỗi khác từ smart contract
      if (error.transactionLogs) {
        const logs = error.transactionLogs.join(' ');
        if (logs.includes('custom program error: 0x1')) {
          throw new BadRequestException(
            'Transaction failed due to insufficient SOL for transaction fees. Please check your SOL balance in your wallet.'
          );
        }
      }
      
      throw new InternalServerErrorException(error.message || 'Failed to stake on-chain.');
    }
  }

  async unstake(walletId: number, userStakeId: number): Promise<UserStake> {
    // 1. Fetch user stake and wallet info
    const userStake = await this.userStakeRepository.findOne({ where: { id: userStakeId } });
    if (!userStake) {
      throw new NotFoundException(`Stake with ID ${userStakeId} not found.`);
    }

    if (userStake.wallet_id !== walletId) {
      throw new UnauthorizedException('You are not the owner of this stake.');
    }
    
    if (userStake.status !== UserStakeStatus.ACTIVE) {
      throw new BadRequestException('Stake is not active and cannot be unstaked.');
    }
    
    // 2. Check time condition
    if (new Date() < new Date(userStake.end_date)) {
      throw new BadRequestException('Stake is still within the locking period.');
    }

    const wallet = await this.walletRepository.findOne({ where: { id: walletId }, select: ['id', 'private_key'] });
    if (!wallet || !wallet.private_key) {
      throw new NotFoundException(`Wallet for this stake not found or has no private key.`);
    }

    try {
      // 3. Prepare transaction
      const userKeypair = Keypair.fromSecretKey(bs58.decode(wallet.private_key));
      const userPublicKey = userKeypair.publicKey;

      const userStakePDA = new PublicKey(userStake.stake_account_pda);

      const [vaultPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        this.programId
      );

      const allowedTokenMint = new PublicKey(process.env.MMP_TOKEN_MINT || "FrbqVX4esWyfA4PvZngXKvbPenzMV7XVdLw6JdQMpTSC");
      const userTokenAccount = await getAssociatedTokenAddress(allowedTokenMint, userPublicKey);

      // 4. Create instruction data
      const discriminator = Buffer.from(sha256.digest('global:unstake')).slice(0, 8);
      const instructionArgs = new UnstakeInstruction({ stake_id: BigInt(userStake.stake_id) });
      const instructionData = Buffer.concat([discriminator, borsh.serialize(unstakeInstructionSchema, instructionArgs)]);

      const txInstruction = new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: userPublicKey, isSigner: true, isWritable: true },
          { pubkey: userStakePDA, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: vaultPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      const transaction = new Transaction().add(txInstruction);
      const txSignature = await this.connection.sendTransaction(transaction, [userKeypair]);

      // 5. Update database
      userStake.status = UserStakeStatus.COMPLETED;
      userStake.unstaking_tx_signature = txSignature;
      return await this.userStakeRepository.save(userStake);

    } catch (error) {
      console.error('Failed to unstake:', error);
      
      // Kiểm tra lỗi insufficient lamports để hiển thị thông báo rõ ràng
      if (error.message && error.message.includes('insufficient lamports')) {
        throw new BadRequestException(
          'Your wallet does not have enough SOL to perform the unstake transaction. You need at least 0.001 SOL to pay for transaction fees. Please add more SOL to your wallet.'
        );
      }
      
      // Kiểm tra các lỗi khác từ smart contract
      if (error.transactionLogs) {
        const logs = error.transactionLogs.join(' ');
        if (logs.includes('custom program error: 0x1')) {
          throw new BadRequestException(
            'Unstake transaction failed due to insufficient SOL for transaction fees. Please check your SOL balance in your wallet.'
          );
        }
      }
      
      throw new InternalServerErrorException(error.message || 'Failed to unstake on-chain.');
    }
  }

  async findByWalletId(walletId: number): Promise<UserStake[]> {
    const stakes = await this.userStakeRepository.find({
      where: { wallet_id: walletId },
      relations: ['staking_plan'],
      order: { created_at: 'DESC' },
    });
    
    return stakes;
  }

  async prepareStakeTransaction(
    wallet: Wallet, 
    prepareStakeDto: PrepareStakeDto
  ): Promise<{ transaction: string }> {
    const { amount_staked, lock_months } = prepareStakeDto;
    const userPublicKey = new PublicKey(wallet.sol_address);

    // Kiểm tra số dư MMP token trước khi chuẩn bị transaction
    const allowedTokenMint = new PublicKey(process.env.MMP_TOKEN_MINT || "FrbqVX4esWyfA4PvZngXKvbPenzMV7XVdLw6JdQMpTSC");
    const userTokenAccount = await getAssociatedTokenAddress(allowedTokenMint, userPublicKey);
    
    const tokenAccountInfo = await this.connection.getTokenAccountBalance(userTokenAccount);
    const userMMPBalance = tokenAccountInfo.value.uiAmount || 0;
    
    if (userMMPBalance < amount_staked) {
      throw new BadRequestException(
        `Insufficient MMP tokens. Your balance: ${userMMPBalance} MMP, Required: ${amount_staked} MMP`
      );
    }

    // Fetch on-chain data to build the transaction
    const [stakeStatePDA] = await PublicKey.findProgramAddress([Buffer.from("stake_state")], this.programId);
    const stakeStateInfo = await this.connection.getAccountInfo(stakeStatePDA);
    if (!stakeStateInfo) throw new InternalServerErrorException("Stake state not initialized.");

    const data = stakeStateInfo.data.slice(8);
    const blacklistLen = data.readUInt32LE(0);
    const stakeCounterOffset = 4 + blacklistLen * 32;
    const stakeCounter = data.readBigUInt64LE(stakeCounterOffset);
    const stakeCounterBuffer = Buffer.alloc(8);
    stakeCounterBuffer.writeBigUInt64LE(stakeCounter);

    const [userStakePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("user_stake"), userPublicKey.toBuffer(), stakeCounterBuffer],
      this.programId
    );

    // Build the instruction
    const instruction = await this.createStakeInstruction(userPublicKey, stakeCounter, amount_staked, lock_months);

    // Get the latest blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();

    // Create a new transaction
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: userPublicKey,
    });
    transaction.add(instruction);

    // Serialize the transaction without signing
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: serializedTransaction.toString('base64'),
    };
  }

  async executeStakeTransaction(
    wallet: Wallet,
    executeStakeDto: ExecuteStakeDto
  ): Promise<UserStake> {
    const { signedTransaction, staking_plan_id } = executeStakeDto;

    // 1. Decode and deserialize the transaction
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    // 2. Security Checks
    // Check #1: The first signature must be the user's
    if (!transaction.signatures[0] || !transaction.signatures[0].publicKey.equals(new PublicKey(wallet.sol_address))) {
      throw new UnauthorizedException("Transaction not signed by the correct user.");
    }

    // Check #2: The signature must be valid
    if (!transaction.verifySignatures()) {
      throw new BadRequestException("Invalid transaction signature.");
    }

    // Check #3 (Content Verification)
    if (transaction.instructions.length !== 1 || !transaction.instructions[0].programId.equals(this.programId)) {
        throw new BadRequestException("Transaction content is invalid.");
    }

    // 3. Relay the transaction
    try {
      const txSignature = await this.connection.sendRawTransaction(transactionBuffer, {
        skipPreflight: true,
      });

      // Check if this signature has already been processed
      const existingStakeBySig = await this.userStakeRepository.findOne({ where: { staking_tx_signature: txSignature } });
      if (existingStakeBySig) {
        throw new BadRequestException('This transaction has already been processed.');
      }

      await this.connection.confirmTransaction(txSignature);

      // Re-fetch stake_counter to ensure we get the correct one that was used
      const [stakeStatePDA] = await PublicKey.findProgramAddress([Buffer.from("stake_state")], this.programId);
      const stakeStateInfo = await this.connection.getAccountInfo(stakeStatePDA);
      if (!stakeStateInfo) throw new InternalServerErrorException("Stake state not initialized.");
      const data = stakeStateInfo.data.slice(8);
      const blacklistLen = data.readUInt32LE(0);
      const stakeCounterOffset = 4 + blacklistLen * 32;
      // The counter has already been incremented on-chain, so we get the one for the *next* stake.
      // The one used for *this* stake was `current_counter - 1`.
      const currentStakeCounter = data.readBigUInt64LE(stakeCounterOffset);
      const stake_id = Number(currentStakeCounter) - 1;

      // Decode instruction data
      const instructionData = transaction.instructions[0].data.slice(8);
      const decodedInstruction = borsh.deserialize(stakeInstructionSchema, StakeInstruction, instructionData);
      const amount_staked = Number(decodedInstruction.amount) / (10 ** 6);
      const lock_months = decodedInstruction.lock_months;

      // 4. Save to database
      const userPublicKey = new PublicKey(wallet.sol_address);
      const stakeCounterBuffer = Buffer.alloc(8);
      stakeCounterBuffer.writeBigUInt64LE(BigInt(stake_id));
      const [userStakePDA] = await PublicKey.findProgramAddress(
          [Buffer.from("user_stake"), userPublicKey.toBuffer(), stakeCounterBuffer],
          this.programId
      );

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + lock_months);

      const newUserStake = this.userStakeRepository.create({
          wallet_id: wallet.id,
          staking_plan_id,
          stake_id,
          stake_account_pda: userStakePDA.toBase58(),
          staking_tx_signature: txSignature,
          amount_staked,
          start_date: new Date(),
          end_date: endDate,
          status: UserStakeStatus.ACTIVE,
      });

      return await this.userStakeRepository.save(newUserStake);
    } catch (error) {
      console.error('Failed to execute stake transaction:', error);
      
      // Kiểm tra lỗi insufficient lamports để hiển thị thông báo rõ ràng
      if (error.message && error.message.includes('insufficient lamports')) {
        throw new BadRequestException(
          'Your wallet does not have enough SOL to create a new stake account. You need at least 0.002 SOL to pay for account creation fees. Please add more SOL to your wallet.'
        );
      }
      
      // Kiểm tra các lỗi khác từ smart contract
      if (error.transactionLogs) {
        const logs = error.transactionLogs.join(' ');
        if (logs.includes('custom program error: 0x1')) {
          throw new BadRequestException(
            'Transaction failed due to insufficient SOL for transaction fees. Please check your SOL balance in your wallet.'
          );
        }
      }
      
      throw new InternalServerErrorException(error.message || 'Failed to execute stake transaction.');
    }
  }

  async prepareUnstakeTransaction(
    wallet: Wallet,
    userStakeId: number
  ): Promise<{ transaction: string }> {
    // 1. Fetch and validate the stake
    const userStake = await this.userStakeRepository.findOne({ where: { id: userStakeId } });
    if (!userStake) throw new NotFoundException(`Stake with ID ${userStakeId} not found.`);
    if (userStake.wallet_id !== wallet.id) throw new UnauthorizedException('You are not the owner of this stake.');
    if (userStake.status !== UserStakeStatus.ACTIVE) throw new BadRequestException('Stake is not active.');
    if (new Date() < new Date(userStake.end_date)) throw new BadRequestException('Stake is still locked.');

    // 2. Build the instruction
    const userPublicKey = new PublicKey(wallet.sol_address);
    const instruction = await this.createUnstakeInstruction(userPublicKey, BigInt(userStake.stake_id));

    // 3. Create and serialize the transaction
    const { blockhash } = await this.connection.getLatestBlockhash();
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: userPublicKey,
    });
    transaction.add(instruction);

    const serializedTransaction = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    return { transaction: serializedTransaction.toString('base64') };
  }

  async executeUnstakeTransaction(
    wallet: Wallet,
    executeUnstakeDto: ExecuteUnstakeDto
  ): Promise<UserStake> {
    const { signedTransaction, user_stake_id } = executeUnstakeDto;
    
    // 1. Fetch the stake to update later
    const userStake = await this.userStakeRepository.findOne({ where: { id: user_stake_id } });
    if (!userStake) throw new NotFoundException(`Stake with ID ${user_stake_id} not found.`);
    if (userStake.wallet_id !== wallet.id) throw new UnauthorizedException('You are not the owner of this stake.');
    
    // 2. Decode, verify, and check transaction
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    if (!transaction.signatures[0] || !transaction.signatures[0].publicKey.equals(new PublicKey(wallet.sol_address))) {
      throw new UnauthorizedException("Transaction not signed by the correct user.");
    }
    if (!transaction.verifySignatures()) {
      throw new BadRequestException("Invalid transaction signature.");
    }
    if (transaction.instructions.length !== 1 || !transaction.instructions[0].programId.equals(this.programId)) {
        throw new BadRequestException("Transaction content is invalid.");
    }
    
    // 3. Relay the transaction
    try {
      const txSignature = await this.connection.sendRawTransaction(transactionBuffer, { skipPreflight: true });

      // 4. Anti-replay check for unstake signature
      const existingUnstake = await this.userStakeRepository.findOne({ where: { unstaking_tx_signature: txSignature } });
      if (existingUnstake) {
        throw new BadRequestException('This unstake transaction has already been processed.');
      }

      await this.connection.confirmTransaction(txSignature);

      // 5. Update database
      userStake.status = UserStakeStatus.COMPLETED;
      userStake.unstaking_tx_signature = txSignature;
      return await this.userStakeRepository.save(userStake);
    } catch (error) {
      console.error('Failed to execute unstake transaction:', error);
      
      // Kiểm tra lỗi insufficient lamports để hiển thị thông báo rõ ràng
      if (error.message && error.message.includes('insufficient lamports')) {
        throw new BadRequestException(
          'Your wallet does not have enough SOL to perform the unstake transaction. You need at least 0.001 SOL to pay for transaction fees. Please add more SOL to your wallet.'
        );
      }
      
      // Kiểm tra các lỗi khác từ smart contract
      if (error.transactionLogs) {
        const logs = error.transactionLogs.join(' ');
        if (logs.includes('custom program error: 0x1')) {
          throw new BadRequestException(
            'Unstake transaction failed due to insufficient SOL for transaction fees. Please check your SOL balance in your wallet.'
          );
        }
      }
      
      throw new InternalServerErrorException(error.message || 'Failed to execute unstake transaction.');
    }
  }

  private async createStakeInstruction(userPublicKey: PublicKey, stakeCounter: bigint, amount_staked: number, lock_months: number): Promise<TransactionInstruction> {
    const stakeCounterBuffer = Buffer.alloc(8);
    stakeCounterBuffer.writeBigUInt64LE(stakeCounter);

    const [stakeStatePDA] = await PublicKey.findProgramAddress([Buffer.from("stake_state")], this.programId);
    const [userStakePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("user_stake"), userPublicKey.toBuffer(), stakeCounterBuffer],
      this.programId
    );
    const [vaultPDA] = await PublicKey.findProgramAddress([Buffer.from("vault")], this.programId);

    const allowedTokenMint = new PublicKey(process.env.MMP_TOKEN_MINT || "FrbqVX4esWyfA4PvZngXKvbPenzMV7XVdLw6JdQMpTSC");
    const userTokenAccount = await getAssociatedTokenAddress(allowedTokenMint, userPublicKey);

    const discriminator = Buffer.from(sha256.digest('global:stake')).slice(0, 8);
    const MMP_TOKEN_DECIMALS = 6;
    const amount = BigInt(amount_staked * (10 ** MMP_TOKEN_DECIMALS));
    const instructionArgs = new StakeInstruction({ amount, lock_months });
    const instructionData = Buffer.concat([discriminator, borsh.serialize(stakeInstructionSchema, instructionArgs)]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: stakeStatePDA, isSigner: false, isWritable: true },
        { pubkey: userStakePDA, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  private async createUnstakeInstruction(userPublicKey: PublicKey, stakeId: bigint): Promise<TransactionInstruction> {
    const stakeCounterBuffer = Buffer.alloc(8);
    stakeCounterBuffer.writeBigUInt64LE(stakeId);

    const [userStakePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("user_stake"), userPublicKey.toBuffer(), stakeCounterBuffer],
      this.programId
    );
    const [vaultPDA] = await PublicKey.findProgramAddress([Buffer.from("vault")], this.programId);

    const allowedTokenMint = new PublicKey(process.env.MMP_TOKEN_MINT || "FrbqVX4esWyfA4PvZngXKvbPenzMV7XVdLw6JdQMpTSC");
    const userTokenAccount = await getAssociatedTokenAddress(allowedTokenMint, userPublicKey);

    const discriminator = Buffer.from(sha256.digest('global:unstake')).slice(0, 8);
    const instructionArgs = new UnstakeInstruction({ stake_id: stakeId });
    const instructionData = Buffer.concat([discriminator, borsh.serialize(unstakeInstructionSchema, instructionArgs)]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: userStakePDA, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  /**
   * Lấy thống kê stake của ví và tổng số người đang stake, tổng stake tháng này và tháng trước
   */
  async getStakeStatistics(walletId: number) {
    // Xác định khoảng thời gian tháng này và tháng trước
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      totalStaked, 
      activeStakersCount, 
      totalStakedThisMonth, 
      totalStakedLastMonth,
      totalClaimedThisMonth,
      totalClaimedLastMonth
    ] = await Promise.all([
      // Tổng amount_staked của ví
      this.userStakeRepository
        .createQueryBuilder('stake')
        .select('SUM(stake.amount_staked)', 'total')
        .where('stake.wallet_id = :walletId', { walletId })
        .getRawOne(),
      // Số lượng người đang stake
      this.userStakeRepository.count({ where: { status: UserStakeStatus.ACTIVE } }),
      // Tổng stake tháng này
      this.userStakeRepository
        .createQueryBuilder('stake')
        .select('SUM(stake.amount_staked)', 'total')
        .where('stake.wallet_id = :walletId', { walletId })
        .andWhere('stake.created_at >= :startOfThisMonth', { startOfThisMonth })
        .getRawOne(),
      // Tổng stake tháng trước
      this.userStakeRepository
        .createQueryBuilder('stake')
        .select('SUM(stake.amount_staked)', 'total')
        .where('stake.wallet_id = :walletId', { walletId })
        .andWhere('stake.created_at >= :startOfLastMonth', { startOfLastMonth })
        .andWhere('stake.created_at <= :endOfLastMonth', { endOfLastMonth })
        .getRawOne(),
      // Tổng amount_claimed tháng này
      this.userStakeRepository
        .createQueryBuilder('stake')
        .select('SUM(stake.amount_claimed)', 'total')
        .where('stake.wallet_id = :walletId', { walletId })
        .andWhere('stake.updated_at >= :startOfThisMonth', { startOfThisMonth })
        .andWhere('stake.amount_claimed IS NOT NULL')
        .getRawOne(),
      // Tổng amount_claimed tháng trước
      this.userStakeRepository
        .createQueryBuilder('stake')
        .select('SUM(stake.amount_claimed)', 'total')
        .where('stake.wallet_id = :walletId', { walletId })
        .andWhere('stake.updated_at >= :startOfLastMonth', { startOfLastMonth })
        .andWhere('stake.updated_at <= :endOfLastMonth', { endOfLastMonth })
        .andWhere('stake.amount_claimed IS NOT NULL')
        .getRawOne(),
    ]);

    return {
      total_staked_mmp: parseFloat(totalStaked?.total || '0'),
      active_stakers_count: activeStakersCount,
      total_staked_this_month: parseFloat(totalStakedThisMonth?.total || '0'),
      total_staked_last_month: parseFloat(totalStakedLastMonth?.total || '0'),
      total_claimed_this_month: parseFloat(totalClaimedThisMonth?.total || '0'),
      total_claimed_last_month: parseFloat(totalClaimedLastMonth?.total || '0'),
    };
  }
} 