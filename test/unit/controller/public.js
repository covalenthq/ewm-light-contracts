const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  getRewardsManager,
  deployMockCqtContract,
  depositReward,
  oneToken,
} = require('../../helpers');

describe('EwmNftController - Public Getters', () => {
  let controllerContract;
  let owner;
  let admin;
  let rewarder;
  let tokenHolderAddresses;
  let cqtContract;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const tokenHolders = await getTokenHolders();
    tokenHolderAddresses = tokenHolders.slice(0, 5).map((holder) => holder.address);

    cqtContract = await deployMockCqtContract(owner);
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    // Setup
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
  });

  describe('CXT', () => {
    it('should return the correct CXT address', async () => {
      expect(await controllerContract.cxt()).to.equal(cqtContract.address);
    });
  });

  describe('minterAdminAddress', () => {
    it('should return the correct minter admin address', async () => {
      expect(await controllerContract.minterAdminAddress()).to.equal(admin.address);
    });
  });

  describe('banAdminAddress', () => {
    it('should return the correct ban admin address', async () => {
      expect(await controllerContract.banAdminAddress()).to.equal(admin.address);
    });
  });

  describe('whitelistAdminAddress', () => {
    it('should return the correct whitelist admin address', async () => {
      expect(await controllerContract.whitelistAdminAddress()).to.equal(admin.address);
    });
  });

  describe('rewardManager', () => {
    it('should return the correct reward manager address', async () => {
      expect(await controllerContract.rewardManager()).to.equal(rewarder.address);
    });
  });

  describe('nextTokenId', () => {
    it('should return the correct next token ID', async () => {
      const initialNextTokenId = await controllerContract.nextTokenId();
      expect(initialNextTokenId).to.equal(1);

      await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 1);
      const updatedNextTokenId = await controllerContract.nextTokenId();
      expect(updatedNextTokenId).to.equal(2);
    });
  });

  describe('rewardPool', () => {
    it('should return the correct reward pool amount', async () => {
      const initialRewardPool = await controllerContract.rewardPool();
      expect(initialRewardPool).to.equal(0);
      const rewardAmount = oneToken.mul(100);

      await depositReward(cqtContract, controllerContract, oneToken.mul(100));

      const updatedRewardPool = await controllerContract.rewardPool();
      expect(updatedRewardPool).to.equal(rewardAmount);
    });
  });

  describe('nftTransferable', () => {
    it('should return the correct NFT transferable status', async () => {
      const initialTransferableStatus = await controllerContract.nftTransferable();
      expect(initialTransferableStatus).to.be.false;

      await controllerContract.updateNftTransferable(true);
      const updatedTransferableStatus = await controllerContract.nftTransferable();
      expect(updatedTransferableStatus).to.be.true;
    });
  });

  describe('baseUrl', () => {
    it('should return the correct base URL', async () => {
      const initialBaseUrl = await controllerContract.baseUrl();
      expect(initialBaseUrl).to.equal('');

      const newBaseUrl = 'https://example.com/nft/';
      await controllerContract.setBaseUrl(newBaseUrl);
      const updatedBaseUrl = await controllerContract.baseUrl();
      expect(updatedBaseUrl).to.equal(newBaseUrl);
    });
  });

  describe('getWhitelistTransferTime', () => {
    it('should return the correct whitelist transfer time range', async () => {
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 3600; // 1 hour from now

      await controllerContract.connect(admin).updateWhitelistTransferTime(startTime, endTime);

      const [returnedStartTime, returnedEndTime] =
        await controllerContract.getWhitelistTransferTime();
      expect(returnedStartTime).to.equal(startTime);
      expect(returnedEndTime).to.equal(endTime);
    });
  });
  describe('name', () => {
    it('should return the correct name of the token', async () => {
      const name = await controllerContract.name();
      expect(name).to.equal('EWM Light-Client (CXT) Controller');
    });
  });

  describe('symbol', () => {
    it('should return the correct symbol of the token', async () => {
      const symbol = await controllerContract.symbol();
      expect(symbol).to.equal('EWMLCC');
    });
  });

  describe('tokenURI', () => {
    it('should return the correct token URI', async () => {
      const tokenId = 1;
      await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 1);

      const baseUrl = 'https://storage.googleapis.com/covalent-project/emw-lc/';
      await controllerContract.setBaseUrl(baseUrl);

      const expectedUri = `${baseUrl}${tokenId}`;
      const actualUri = await controllerContract.tokenURI(tokenId);

      expect(actualUri).to.equal(expectedUri);
    });

    it('should revert for non-existent token', async () => {
      const nonExistentTokenId = 9999;

      await expect(controllerContract.tokenURI(nonExistentTokenId)).to.be.revertedWith(
        'ERC721: invalid token ID',
      );
    });
  });

  describe('totalSupply', () => {
    it('should return the correct total supply of tokens', async () => {
      const initialSupply = await controllerContract.totalSupply();
      expect(initialSupply).to.equal(2); // Assuming one token was minted in previous tests

      await controllerContract.connect(admin).mint(tokenHolderAddresses[1], 2);
      const updatedSupply = await controllerContract.totalSupply();
      expect(updatedSupply).to.equal(4);
    });
  });
});
