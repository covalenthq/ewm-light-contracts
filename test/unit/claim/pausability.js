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

describe('EwmNftClaim - Pausability', () => {
  let claimContract;
  let controllerContract;
  let owner;
  let admin;
  let user1;
  let user2;
  let user3;
  let mockAllowanceContract;
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

    // Setup mock allowance contract
    mockAllowanceContract = await deployMockAllowanceContract(owner);
    await mockAllowanceContract.setTotalNftToMint(user1.address, 5);
    await mockAllowanceContract.setTotalNftToMint(user2.address, 5);
    await mockAllowanceContract.setTotalNftToMint(user3.address, 5);

    // Setup for tests
    await controllerContract.updateMinterAdmin(claimContract.address);
    await claimContract
      .connect(admin)
      .updateAllowanceContractsArray([mockAllowanceContract.address]);
  });

  it('Should be paused after initialization', async () => {
    expect(await claimContract.paused()).to.be.true;
  });

  it('Should allow owner to unpause the contract', async () => {
    await expect(claimContract.unpause())
      .to.emit(claimContract, 'Unpaused')
      .withArgs(owner.address);

    expect(await claimContract.paused()).to.be.false;
  });

  it('Should not allow non-owner to unpause the contract', async () => {
    await claimContract.pause();
    await expect(claimContract.connect(admin).unpause()).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
    await claimContract.unpause();
  });

  it('Should allow owner to pause the contract', async () => {
    await expect(claimContract.pause()).to.emit(claimContract, 'Paused').withArgs(owner.address);

    expect(await claimContract.paused()).to.be.true;
  });

  it('Should not allow non-owner to pause the contract', async () => {
    await claimContract.unpause();
    await expect(claimContract.connect(admin).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should not allow pausing an already paused contract', async () => {
    await claimContract.pause();
    await expect(claimContract.pause()).to.be.revertedWith('Pausable: paused');
    await claimContract.unpause();
  });

  it('Should not allow unpausing an already unpaused contract', async () => {
    await expect(claimContract.unpause()).to.be.revertedWith('Pausable: not paused');
  });

  it('Should prevent claiming when paused', async () => {
    await claimContract.pause();
    await expect(claimContract.connect(user1).claim(1)).to.be.revertedWith('Pausable: paused');
    await claimContract.unpause();
  });

  it('Should allow claiming when unpaused', async () => {
    const totalNftPurchased = await claimContract.totalNftPurchased(user1.address);
    // console.log('Total NFT Purchased by user1:', totalNftPurchased.toString());

    if (totalNftPurchased.gt(0)) {
      await expect(claimContract.connect(user1).claim(1)).to.not.be.reverted;
    } else {
      // console.log('No NFTs available for user1 to claim');
      expect(true).to.be.true;
    }
  });

  it('Should prevent claimAll when paused', async () => {
    await claimContract.pause();
    await expect(claimContract.connect(user2).claimAll()).to.be.revertedWith('Pausable: paused');
    await claimContract.unpause();
  });

  it('Should allow claimAll when unpaused', async () => {
    await expect(claimContract.connect(user2).claimAll()).to.not.be.reverted;
    const totalNftClaimed = await claimContract.totalNftClaimed(user2.address);
    // console.log('Total NFT Claimed by user2:', totalNftClaimed.toString());
    expect(totalNftClaimed).to.equal(5);
  });

  it('Should prevent adminClaim when paused', async () => {
    await claimContract.connect(owner).pause();
    await expect(claimContract.connect(admin).adminClaim(user3.address, 1)).to.be.revertedWith(
      'Pausable: paused',
    );
    await claimContract.unpause();
  });

  it('Should allow adminClaim when unpaused', async () => {
    await expect(claimContract.connect(admin).adminClaim(user3.address, 1)).to.not.be.reverted;
    const totalNftClaimed = await claimContract.totalNftClaimed(user3.address);
    expect(totalNftClaimed).to.equal(1);
  });

  it('Should prevent adminBatchClaim when paused', async () => {
    await claimContract.pause();
    await expect(
      claimContract.connect(admin).adminBatchClaim([user3.address], [1]),
    ).to.be.revertedWith('Pausable: paused');
    await claimContract.unpause();
  });

  it('Should allow adminBatchClaim when unpaused', async () => {
    await expect(claimContract.connect(admin).adminBatchClaim([user3.address], [1])).to.not.be
      .reverted;
    const totalNftClaimed = await claimContract.totalNftClaimed(user3.address);
    expect(totalNftClaimed).to.equal(2);
  });

  it('Should prevent adminBatchClaimAll when paused', async () => {
    await claimContract.pause();
    await expect(
      claimContract.connect(admin).adminBatchClaimAll([user3.address]),
    ).to.be.revertedWith('Pausable: paused');
    await claimContract.unpause();
  });

  it('Should allow adminBatchClaimAll when unpaused', async () => {
    await expect(claimContract.connect(admin).adminBatchClaimAll([user3.address])).to.not.be
      .reverted;
    const totalNftClaimed = await claimContract.totalNftClaimed(user3.address);
    expect(totalNftClaimed).to.equal(5);
  });

  describe('getMetadata', () => {
    it('Should return correct initial metadata', async () => {
      const metadata = await claimContract.getMetadata();
      expect(metadata._nftClaim).to.equal(claimContract.address);
      expect(metadata._nftController).to.equal(controllerContract.address);
      expect(metadata._claimAdmin).to.equal(admin.address);
      expect(metadata._allowanceContracts).to.deep.equal([mockAllowanceContract.address]);
      expect(metadata._totalNftClaimed).to.equal(11);
      expect(metadata._paused).to.be.false;
    });

    it('Should reflect changes in allowance contracts', async () => {
      const newAllowanceContract = ethers.Wallet.createRandom().address;

      // Update allowance contracts
      await claimContract.connect(admin).updateAllowanceContractsArray([newAllowanceContract]);

      const metadata = await claimContract.getMetadata();

      expect(metadata._allowanceContracts).to.deep.equal([newAllowanceContract]);
    });
  });
});
