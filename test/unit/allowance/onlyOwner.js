const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
  impersonateAll,
  getTokenHolders,
  getOwner,
  oneToken,
  deployCxtFaucet,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftAllowance - Only Owner Functions', () => {
  let allowanceContract;
  let controllerContract;
  let owner;
  let user1;
  let cxtContract;
  let startTime;
  let endTime;
  let nftExpiryTime;
  let rewarder;
  const stakePrice = oneToken.mul(2500);
  const maxTotalStakeable = oneToken.mul(500000);

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    const tokenHolders = await getTokenHolders();
    [user1] = tokenHolders.slice(0, 1).map((holder) => ethers.provider.getSigner(holder.address));

    cxtContract = await deployCxtFaucet();
    rewarder = await getRewardsManager();
    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cxtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    // Set up times
    const currentBlock = await ethers.provider.getBlock('latest');
    startTime = currentBlock.timestamp + 7 * 24 * 60 * 60; // 1 week from now
    endTime = startTime + 7 * 24 * 60 * 60; // 1 week after startTime
    nftExpiryTime = startTime + 53 * 7 * 24 * 60 * 60; // 1 year + 1 week from startTime

    // Deploy allowance contract
    const allowance = await ethers.getContractFactory('EwmNftAllowance', owner);
    allowanceContract = await allowance.deploy(
      stakePrice,
      cxtContract.address,
      controllerContract.address,
      startTime,
      endTime,
      maxTotalStakeable,
      nftExpiryTime,
    );
    await allowanceContract.deployed();
  });

  describe('pause', () => {
    it('Should allow owner to pause the contract', async () => {
      await expect(allowanceContract.connect(owner).pause())
        .to.emit(allowanceContract, 'Paused')
        .withArgs(owner.address);
      expect(await allowanceContract.paused()).to.be.true;
    });

    it('Should not allow non-owner to pause the contract', async () => {
      await allowanceContract.connect(owner).unpause();
      await expect(allowanceContract.connect(user1).pause()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('unpause', () => {
    it('Should allow owner to unpause the contract', async () => {
      await allowanceContract.connect(owner).pause();
      await expect(allowanceContract.connect(owner).unpause())
        .to.emit(allowanceContract, 'Unpaused')
        .withArgs(owner.address);
      expect(await allowanceContract.paused()).to.be.false;
    });

    it('Should not allow non-owner to unpause the contract', async () => {
      await allowanceContract.connect(owner).pause();
      await expect(allowanceContract.connect(user1).unpause()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
      await allowanceContract.connect(owner).unpause();
    });
  });

  describe('setWhitelistRootHash', () => {
    it('Should allow owner to set whitelist root hash', async () => {
      const newRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('new root hash'));
      await expect(allowanceContract.connect(owner).setWhitelistRootHash(newRootHash))
        .to.emit(allowanceContract, 'WhitelistRootHashUpdated')
        .withArgs(newRootHash);
      expect(await allowanceContract.whitelistRootHash()).to.equal(newRootHash);
    });

    it('Should not allow non-owner to set whitelist root hash', async () => {
      const newRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('another root hash'));
      await expect(
        allowanceContract.connect(user1).setWhitelistRootHash(newRootHash),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setIsIntegerAllocation', () => {
    it('Should allow owner to set integer allocation flag', async () => {
      await expect(allowanceContract.connect(owner).setIsIntegerAllocation(true))
        .to.emit(allowanceContract, 'IntegerAllocationUpdated')
        .withArgs(true);
      expect(await allowanceContract.isIntegerAllowance()).to.be.true;

      await expect(allowanceContract.connect(owner).setIsIntegerAllocation(false))
        .to.emit(allowanceContract, 'IntegerAllocationUpdated')
        .withArgs(false);
      expect(await allowanceContract.isIntegerAllowance()).to.be.false;
    });

    it('Should not allow non-owner to set integer allocation flag', async () => {
      await expect(
        allowanceContract.connect(user1).setIsIntegerAllocation(true),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setNftControllerAddress', () => {
    it('Should allow owner to set NFT contract address', async () => {
      const newNFTContract = ethers.Wallet.createRandom().address;
      await expect(allowanceContract.connect(owner).setNftControllerAddress(newNFTContract))
        .to.emit(allowanceContract, 'NftControllerUpdated')
        .withArgs(newNFTContract);
      expect(await allowanceContract.nftController()).to.equal(newNFTContract);
    });

    it('Should not allow non-owner to set NFT contract address', async () => {
      const newNFTContract = ethers.Wallet.createRandom().address;
      await expect(
        allowanceContract.connect(user1).setNftControllerAddress(newNFTContract),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setNftExpiryTime', () => {
    it('Should allow owner to set NFT expiry time', async () => {
      const newExpiryTime = nftExpiryTime + 30 * 24 * 60 * 60; // Add 30 days
      await expect(allowanceContract.connect(owner).setNftExpiryTime(newExpiryTime))
        .to.emit(allowanceContract, 'NftExpiryTimeUpdated')
        .withArgs(newExpiryTime);
      expect(await allowanceContract.nftExpiryTime()).to.equal(newExpiryTime);
    });

    it('Should not allow non-owner to set NFT expiry time', async () => {
      const newExpiryTime = nftExpiryTime + 60 * 24 * 60 * 60; // Add 60 days
      await expect(
        allowanceContract.connect(user1).setNftExpiryTime(newExpiryTime),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should not allow setting NFT expiry time before start time', async () => {
      const invalidExpiryTime = startTime - 1;
      await expect(
        allowanceContract.connect(owner).setNftExpiryTime(invalidExpiryTime),
      ).to.be.revertedWith('NFT expiry time must be after end time');
    });

    it('Should not allow setting NFT expiry time before end time', async () => {
      const invalidExpiryTime = endTime - 1;
      await expect(
        allowanceContract.connect(owner).setNftExpiryTime(invalidExpiryTime),
      ).to.be.revertedWith('NFT expiry time must be after end time');
    });
  });

  describe('transferOwnership', () => {
    it('Should allow owner to transfer ownership', async () => {
      const newOwner = ethers.Wallet.createRandom().address;
      await expect(allowanceContract.connect(owner).transferOwnership(newOwner))
        .to.emit(allowanceContract, 'OwnershipTransferStarted')
        .withArgs(owner.address, newOwner);
      expect(await allowanceContract.pendingOwner()).to.equal(newOwner);
    });

    it('Should not allow non-owner to transfer ownership', async () => {
      const newOwner = ethers.Wallet.createRandom().address;
      await expect(allowanceContract.connect(user1).transferOwnership(newOwner)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('renounceOwnership', () => {
    it('Should not allow renouncing ownership', async () => {
      await expect(allowanceContract.connect(owner).renounceOwnership()).to.be.revertedWith(
        'Ownable2Step: can not renounce ownership',
      );
    });
  });

  describe('updateAllocationPeriod', () => {
    it('Should allow owner to update allocation period', async () => {
      const newStartTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const newEndTime = newStartTime + 7 * 24 * 60 * 60; // 1 week after new start time
      const newExpiryTime = newEndTime + 30 * 24 * 60 * 60; // 1 month after new end time
      await allowanceContract.connect(owner).setNftExpiryTime(newExpiryTime);
      await expect(
        allowanceContract.connect(owner).updateAllocationPeriod(newStartTime, newEndTime),
      )
        .to.emit(allowanceContract, 'AllocationPeriodUpdated')
        .withArgs(newStartTime, newEndTime);

      const updatedStartTime = await allowanceContract.startTime();
      const updatedEndTime = await allowanceContract.endTime();
      expect(updatedStartTime).to.equal(newStartTime);
      expect(updatedEndTime).to.equal(newEndTime);
    });

    it('Should not allow non-owner to update allocation period', async () => {
      const newStartTime = Math.floor(Date.now() / 1000) + 3600;
      const newEndTime = newStartTime + 7 * 24 * 60 * 60;
      await expect(
        allowanceContract.connect(user1).updateAllocationPeriod(newStartTime, newEndTime),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should not allow end time to be before start time', async () => {
      const newStartTime = Math.floor(Date.now() / 1000) + 3600;
      const newEndTime = newStartTime - 3600;
      await expect(
        allowanceContract.connect(owner).updateAllocationPeriod(newStartTime, newEndTime),
      ).to.be.revertedWith('End time must be after start time');
    });

    it('Should not allow start time to be in the past', async () => {
      const currentBlock = await ethers.provider.getBlock('latest');
      const currentBlockTime = currentBlock.timestamp;

      const newStartTime = currentBlockTime - 3600; // 1 hour before current block
      const newEndTime = currentBlockTime + 7 * 24 * 60 * 60; // 1 week after current block

      await expect(
        allowanceContract.connect(owner).updateAllocationPeriod(newStartTime, newEndTime),
      ).to.be.revertedWith('Start time must not be in the past');
    });

    it('Should not allow end time to be after NFT expiry time', async () => {
      const currentNftExpiryTime = await allowanceContract.nftExpiryTime();
      const currentBlock = await ethers.provider.getBlock('latest');
      const currentBlockTime = currentBlock.timestamp;
      const newStartTime = currentBlockTime + 3600;
      const newEndTime = currentNftExpiryTime.add(1);
      await expect(
        allowanceContract.connect(owner).updateAllocationPeriod(newStartTime, newEndTime),
      ).to.be.revertedWith('End time must be before NFT expiry time');
    });
  });

  describe('updateMaxTotalStakeable', () => {
    it('Should allow owner to update max total stakeable', async () => {
      const newMaxTotalStakeable = maxTotalStakeable.add(oneToken.mul(100000)); // Increase by 100,000 tokens
      await expect(allowanceContract.connect(owner).updateMaxTotalStakeable(newMaxTotalStakeable))
        .to.emit(allowanceContract, 'MaxTotalStakeableUpdated')
        .withArgs(newMaxTotalStakeable);

      const updatedMaxTotalStakeable = await allowanceContract.maxTotalStakeable();
      expect(updatedMaxTotalStakeable).to.equal(newMaxTotalStakeable);
    });

    it('Should not allow non-owner to update max total stakeable', async () => {
      const newMaxTotalStakeable = maxTotalStakeable.add(oneToken.mul(100000));
      await expect(
        allowanceContract.connect(user1).updateMaxTotalStakeable(newMaxTotalStakeable),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
