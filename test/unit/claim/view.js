const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  deployMockCqtContract,
  deployMockAllowanceContract,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftClaim - View & Getter Functions', () => {
  let claimContract;
  let controllerContract;
  let owner;
  let admin;
  let user1;
  let user2;
  let user3;
  let mockAllowanceContract1;
  let mockAllowanceContract2;
  let rewarder;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    const tokenHolders = await getTokenHolders();
    user1 = tokenHolders[0];
    user2 = tokenHolders[1];
    user3 = tokenHolders[2];
    rewarder = await getRewardsManager();

    // Deploy mock CQT contract
    const cqtContract = await deployMockCqtContract(owner);

    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    await controllerContract.deployed();

    // Deploy claim contract
    const claim = await ethers.getContractFactory('EwmNftClaim', owner);
    claimContract = await claim.deploy(controllerContract.address, admin.address);
    await claimContract.deployed();

    // Setup mock allowance contracts
    mockAllowanceContract1 = await deployMockAllowanceContract(owner);
    mockAllowanceContract2 = await deployMockAllowanceContract(owner);

    // Setup allowances
    await mockAllowanceContract1.setTotalNftToMint(user1.address, 5);
    await mockAllowanceContract1.setTotalNftToMint(user2.address, 3);
    await mockAllowanceContract2.setTotalNftToMint(user2.address, 2);
    await mockAllowanceContract2.setTotalNftToMint(user3.address, 4);

    // Setup stake prices and received amounts
    await mockAllowanceContract1.setStakePrice(ethers.utils.parseEther('100'));
    await mockAllowanceContract1.setTotalStakeReceived(ethers.utils.parseEther('800'));
    await mockAllowanceContract2.setStakePrice(ethers.utils.parseEther('200'));
    await mockAllowanceContract2.setTotalStakeReceived(ethers.utils.parseEther('1200'));

    // Setup for tests
    await controllerContract.updateMinterAdmin(claimContract.address);
    await claimContract
      .connect(admin)
      .updateAllowanceContractsArray([
        mockAllowanceContract1.address,
        mockAllowanceContract2.address,
      ]);

    // Unpause the contract
    await claimContract.unpause();
  });

  describe('claimAdminAddress', () => {
    it('Should return the correct claim admin address', async () => {
      expect(await claimContract.claimAdminAddress()).to.equal(admin.address);
    });
  });

  describe('nftControllerAddress', () => {
    it('Should return the correct NFT controller address', async () => {
      expect(await claimContract.nftControllerAddress()).to.equal(controllerContract.address);
    });
  });

  describe('getAllowanceContractsArray', () => {
    it('Should return the correct allowance contracts array', async () => {
      const allowanceContracts = await claimContract.getAllowanceContractsArray();
      expect(allowanceContracts).to.deep.equal([
        mockAllowanceContract1.address,
        mockAllowanceContract2.address,
      ]);
    });
  });

  describe('totalNftPurchased', () => {
    it('Should return the correct total NFTs purchased for each user', async () => {
      expect(await claimContract.totalNftPurchased(user1.address)).to.equal(5);
      expect(await claimContract.totalNftPurchased(user2.address)).to.equal(5);
      expect(await claimContract.totalNftPurchased(user3.address)).to.equal(4);
    });
  });

  describe('totalNftTokensStaked', () => {
    it('Should return the correct total tokens staked', async () => {
      const expectedTotal = 8 + 6; // (800/100) + (1200/200)
      expect(await claimContract.totalNftTokensStaked()).to.equal(expectedTotal);
    });
  });

  describe('unClaimedNftCount', () => {
    it('Should return the correct unclaimed NFT count for each user', async () => {
      expect(await claimContract.unClaimedNftCount(user1.address)).to.equal(5);
      expect(await claimContract.unClaimedNftCount(user2.address)).to.equal(5);
      expect(await claimContract.unClaimedNftCount(user3.address)).to.equal(4);
    });

    it('Should update unclaimed NFT count after claiming', async () => {
      await claimContract.connect(user1).claim(2);
      expect(await claimContract.unClaimedNftCount(user1.address)).to.equal(3);
    });
  });

  describe('batchUnClaimedNftCount', () => {
    it('Should return the correct batch unclaimed NFT count', async () => {
      const unclaimedCounts = await claimContract.batchUnClaimedNftCount([
        user1.address,
        user2.address,
        user3.address,
      ]);
      const unclaimedCountsAsNumbers = unclaimedCounts.map((count) => count.toNumber());
      expect(unclaimedCountsAsNumbers).to.deep.equal([3, 5, 4]);
    });
  });

  describe('batchClaimedNftCount', () => {
    it('Should return the correct batch claimed NFT count', async () => {
      const claimedCounts = await claimContract.batchClaimedNftCount([
        user1.address,
        user2.address,
        user3.address,
      ]);
      const claimedCountsAsNumbers = claimedCounts.map((count) => count.toNumber());
      expect(claimedCountsAsNumbers).to.deep.equal([2, 0, 0]);
    });
  });

  describe('totalNftClaimed', () => {
    it('Should return the correct total NFTs claimed for each user', async () => {
      expect(await claimContract.totalNftClaimed(user1.address)).to.equal(2);
      expect(await claimContract.totalNftClaimed(user2.address)).to.equal(0);
      expect(await claimContract.totalNftClaimed(user3.address)).to.equal(0);
    });
  });

  describe('inBlacklist', () => {
    it('Should return false for non-blacklisted users', async () => {
      expect(await claimContract.inBlacklist(user1.address)).to.be.false;
      expect(await claimContract.inBlacklist(user2.address)).to.be.false;
      expect(await claimContract.inBlacklist(user3.address)).to.be.false;
    });

    it('Should return true for blacklisted users', async () => {
      await claimContract.connect(admin).updateBlacklist(user2.address, true);
      expect(await claimContract.inBlacklist(user2.address)).to.be.true;
    });
  });

  describe('paused', () => {
    it('Should return false when the contract is not paused', async () => {
      expect(await claimContract.paused()).to.be.false;
    });

    it('Should return true when the contract is paused', async () => {
      await claimContract.connect(owner).pause();
      expect(await claimContract.paused()).to.be.true;
      await claimContract.connect(owner).unpause();
    });
  });

  describe('owner', () => {
    it('Should return the correct owner address', async () => {
      expect(await claimContract.owner()).to.equal(owner.address);
    });
  });

  describe('pendingOwner', () => {
    it('Should return the zero address when there is no pending owner', async () => {
      expect(await claimContract.pendingOwner()).to.equal(ethers.constants.AddressZero);
    });

    it('Should return the correct pending owner address', async () => {
      await claimContract.connect(owner).transferOwnership(user1.address);
      expect(await claimContract.pendingOwner()).to.equal(user1.address);

      // Clean up: Have the new owner accept the ownership
      await claimContract.connect(user1).acceptOwnership();

      // Transfer back to the original owner
      await claimContract.connect(user1).transferOwnership(owner.address);
      await claimContract.connect(owner).acceptOwnership();

      // Verify that pendingOwner is reset to zero address
      expect(await claimContract.pendingOwner()).to.equal(ethers.constants.AddressZero);
    });
  });
});
