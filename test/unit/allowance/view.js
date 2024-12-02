const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  oneToken,
  generateMerkleTree,
  generateMerkleProof,
  getRewardsManager,
  deployCxtFaucet,
} = require('../../helpers');

describe('EwmNftAllowance - View & Getter Functions', () => {
  let allowanceContract;
  let controllerContract;
  let owner;
  let admin;
  let user1;
  let user2;
  let user3;
  let startTime;
  let endTime;
  let nftExpiryTime;
  let rewarder;
  let tokenHolderAddresses;
  let firstThreeTokenHolderAddresses;
  let cxtContract;

  const stakePrice = oneToken.mul(2500);
  const maxTotalStakeable = oneToken.mul(500000);

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    cxtContract = await deployCxtFaucet();
    const tokenHolders = await getTokenHolders();
    tokenHolderAddresses = tokenHolders.slice(0, 3).map((holder) => holder.address);
    firstThreeTokenHolderAddresses = tokenHolderAddresses.slice(0, 3);

    [user1, user2, user3] = firstThreeTokenHolderAddresses.map((address) =>
      ethers.provider.getSigner(address),
    );

    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cxtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
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

    // Setup for controller contract
    await controllerContract.setBaseUrl('https://storage.googleapis.com/covalent-project/emw-lc/');
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);

    // Setup whitelist for allowance contract
    const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.setWhitelistRootHash(rootHash);

    // Set integer allocation
    await allowanceContract.setIsIntegerAllocation(true);
    const cxtAmount = stakePrice.mul(10);
    const tx1 = await cxtContract.connect(owner).faucet(tokenHolderAddresses[0], cxtAmount);
    const tx2 = await cxtContract.connect(owner).faucet(tokenHolderAddresses[1], cxtAmount);
    const tx3 = await cxtContract.connect(owner).faucet(tokenHolderAddresses[2], cxtAmount);

    await tx1.wait();
    await tx2.wait();
    await tx3.wait();

    // Set up transfer whitelist for controller
    await controllerContract
      .connect(admin)
      .updateTransferWhiteList([admin.address, allowanceContract.address], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 3600);
    await controllerContract
      .connect(owner)
      .setExpiryRange(1, 100, Math.floor(Date.now() / 1000) + 3600);
  });

  describe('stakeToken', () => {
    it('Should return the correct stake token address', async () => {
      expect(await allowanceContract.cxt()).to.equal(cxtContract.address);
    });
  });

  describe('nftController', () => {
    it('Should return the correct NFT controller address', async () => {
      expect(await allowanceContract.nftController()).to.equal(controllerContract.address);
    });
  });

  describe('stakePrice', () => {
    it('Should return the correct stake price', async () => {
      expect(await allowanceContract.stakePrice()).to.equal(stakePrice);
    });
  });

  describe('startTime', () => {
    it('Should return the correct start time', async () => {
      expect(await allowanceContract.startTime()).to.equal(startTime);
    });
  });

  describe('endTime', () => {
    it('Should return the correct end time', async () => {
      expect(await allowanceContract.endTime()).to.equal(endTime);
    });
  });

  describe('maxTotalStakeable', () => {
    it('Should return the correct max total stakeable amount', async () => {
      expect(await allowanceContract.maxTotalStakeable()).to.equal(maxTotalStakeable);
    });
  });

  describe('totalStakeReceived', () => {
    it('Should return the correct total stake received', async () => {
      // Set the next block timestamp to startTime
      await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
      await ethers.provider.send('evm_mine');
      const proof1 = generateMerkleProof(firstThreeTokenHolderAddresses, await user1.getAddress());
      const proof2 = generateMerkleProof(firstThreeTokenHolderAddresses, await user2.getAddress());
      await cxtContract.connect(user1).approve(allowanceContract.address, stakePrice);
      await cxtContract.connect(user2).approve(allowanceContract.address, stakePrice);

      await allowanceContract.connect(user1).whitelistedAllocation(1, proof1);
      await allowanceContract.connect(user2).whitelistedAllocation(1, proof2);

      expect(await allowanceContract.totalStakeReceived()).to.equal(stakePrice.mul(2));
    });
  });

  describe('nftExpiryTime', () => {
    it('Should return the correct NFT expiry time', async () => {
      expect(await allowanceContract.nftExpiryTime()).to.equal(nftExpiryTime);
    });
  });

  describe('totalNftToMint', () => {
    it('Should return the correct total NFTs to mint for a user', async () => {
      expect(await allowanceContract.totalNftToMint(await user1.getAddress())).to.equal(1);
      expect(await allowanceContract.totalNftToMint(await user2.getAddress())).to.equal(1);
      expect(await allowanceContract.totalNftToMint(await user3.getAddress())).to.equal(0);
    });
  });

  describe('userStakeAmount', () => {
    it('Should return the correct user stake amount', async () => {
      expect(await allowanceContract.userStakeAmount(await user1.getAddress())).to.equal(
        stakePrice,
      );
      expect(await allowanceContract.userStakeAmount(await user2.getAddress())).to.equal(
        stakePrice,
      );
      expect(await allowanceContract.userStakeAmount(await user3.getAddress())).to.equal(0);
    });
  });

  describe('whitelistRootHash', () => {
    it('Should return the correct whitelist root hash', async () => {
      const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
      const rootHash = merkleTree.getHexRoot();
      expect(await allowanceContract.whitelistRootHash()).to.equal(rootHash);
    });
  });

  describe('isIntegerAllowance', () => {
    it('Should return the correct integer allowance flag', async () => {
      expect(await allowanceContract.isIntegerAllowance()).to.be.true;
    });
  });

  describe('owner', () => {
    it('Should return the correct owner address', async () => {
      expect(await allowanceContract.owner()).to.equal(owner.address);
    });
  });

  describe('paused', () => {
    it('Should return the correct paused state', async () => {
      expect(await allowanceContract.paused()).to.be.false;
      await allowanceContract.pause();
      expect(await allowanceContract.paused()).to.be.true;
      await allowanceContract.unpause();
    });
  });

  describe('checkWhitelist', () => {
    it('Should correctly verify whitelist status', async () => {
      const proof1 = generateMerkleProof(firstThreeTokenHolderAddresses, await user1.getAddress());
      const proof2 = generateMerkleProof(firstThreeTokenHolderAddresses, await user3.getAddress());
      const randomAddress = ethers.Wallet.createRandom().address;
      const proofRandom = generateMerkleProof(firstThreeTokenHolderAddresses, randomAddress);

      expect(await allowanceContract.checkWhitelist(await user1.getAddress(), proof1)).to.be.true;
      expect(await allowanceContract.checkWhitelist(await user3.getAddress(), proof2)).to.be.true;
      expect(await allowanceContract.checkWhitelist(randomAddress, proofRandom)).to.be.false;
    });
  });
});
