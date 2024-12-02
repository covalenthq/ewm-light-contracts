// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {Pausable} from '@openzeppelin/contracts/security/Pausable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/security/ReentrancyGuard.sol';

interface IEwmNftAllowance {
  function totalNftToMint(address user) external view returns (uint256);
  function totalStakeReceived() external view returns (uint256);
  function stakePrice() external view returns (uint256);
}

interface IEwmNftController {
  function mint(address to, uint256 amount) external;
}

contract EwmNftClaim is Ownable2Step, Pausable, ReentrancyGuard {
  address public claimAdminAddress;
  address public nftControllerAddress;
  address[] private _allowanceContractsArray;
  uint256 private _totalNftClaimedAllUsers;
  mapping(address => bool) internal _claimBlacklist;
  mapping(address => uint256) public totalNftClaimed;

  event EventClaimAdminUpdated(address newAdmin);
  event EventClaim(address user, uint256 amount);
  event EventBlacklistUpdated(address indexed user, bool status);
  event EventAllowanceContractsUpdated(address[] contracts);

  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyClaimAdmin() {
    require(msg.sender == claimAdminAddress, 'only claim admin');
    _;
  }

  constructor(address lightClientNFT, address claimAdmin) {
    require(lightClientNFT != address(0), 'Zero address not allowed for NFT controller');
    require(claimAdmin != address(0), 'Zero address not allowed for claim admin');

    nftControllerAddress = lightClientNFT;
    claimAdminAddress = claimAdmin;
    _pause();
  }

  function updateClaimAdmin(address newClaimAdmin) public onlyOwner {
    require(newClaimAdmin != address(0), 'Zero address not allowed for claim admin');
    claimAdminAddress = newClaimAdmin;

    emit EventClaimAdminUpdated(newClaimAdmin);
  }

  function updateAllowanceContractsArray(
    address[] memory allowanceContracts
  ) public onlyClaimAdmin {
    require(allowanceContracts.length > 0, 'Allowance contracts array cannot be empty');
    for (uint256 i = 0; i < allowanceContracts.length; i++) {
      require(allowanceContracts[i] != address(0), 'Invalid allowance contract address');
    }

    _allowanceContractsArray = allowanceContracts;
    emit EventAllowanceContractsUpdated(allowanceContracts);
  }

  function getAllowanceContractsArray() public view returns (address[] memory) {
    return _allowanceContractsArray;
  }

  function totalNftPurchased(address user) public view returns (uint256) {
    uint256 total = 0;
    for (uint256 i = 0; i < _allowanceContractsArray.length; i++) {
      total += IEwmNftAllowance(_allowanceContractsArray[i]).totalNftToMint(user);
    }
    return total;
  }

  function totalNftTokensStaked() public view returns (uint256) {
    uint256 total = 0;
    for (uint256 i = 0; i < _allowanceContractsArray.length; i++) {
      uint256 stakePrice = IEwmNftAllowance(_allowanceContractsArray[i]).stakePrice();
      uint256 totalPaymentReceived = IEwmNftAllowance(_allowanceContractsArray[i])
        .totalStakeReceived();
      uint256 totalStaked = 0;
      if (stakePrice == 0) {
        totalStaked = 0;
      } else {
        totalStaked = (totalPaymentReceived * 1e18) / stakePrice;
      }
      total += totalStaked;
    }
    return total / 1e18;
  }

  function unClaimedNftCount(address user) public view returns (uint256) {
    return totalNftPurchased(user) - totalNftClaimed[user];
  }

  function batchUnClaimedNftCount(
    address[] calldata userArray
  ) public view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](userArray.length);
    for (uint256 i = 0; i < userArray.length; i++) {
      result[i] = unClaimedNftCount(userArray[i]);
    }
    return result;
  }

  function batchClaimedNftCount(
    address[] calldata userArray
  ) public view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](userArray.length);
    for (uint256 i = 0; i < userArray.length; i++) {
      result[i] = totalNftClaimed[userArray[i]];
    }
    return result;
  }

  function claimAll() public whenNotPaused nonReentrant {
    require(!_claimBlacklist[msg.sender], 'blacklisted user');
    _claimAll(msg.sender);
  }

  function claim(uint256 amount) public whenNotPaused nonReentrant {
    require(!_claimBlacklist[msg.sender], 'blacklisted user');
    _claim(msg.sender, amount);
  }

  function _claim(address user, uint256 amount) internal {
    require(user != address(0), 'Zero address not allowed for claim recipient');
    require(amount > 0, 'amount should be greater than 0');
    require(
      amount <= unClaimedNftCount(user),
      'claim amount should be less than or equal to unclaimed nft count'
    );
    totalNftClaimed[user] += amount;
    _totalNftClaimedAllUsers += amount;

    IEwmNftController(nftControllerAddress).mint(user, amount);

    emit EventClaim(user, amount);
  }

  function _claimAll(address user) internal {
    uint256 amount = unClaimedNftCount(user);
    if (amount > 0) {
      _claim(user, amount);
    }
  }

  function adminClaim(address user, uint256 amount) public whenNotPaused onlyClaimAdmin {
    require(!_claimBlacklist[user], 'blacklisted user');
    _claim(user, amount);
  }

  function inBlacklist(address user) public view returns (bool) {
    return _claimBlacklist[user];
  }

  function updateBlacklist(address user, bool val) public onlyClaimAdmin {
    _claimBlacklist[user] = val;
    emit EventBlacklistUpdated(user, val);
  }

  function adminBatchClaim(
    address[] calldata userArray,
    uint256[] calldata amountArray
  ) public whenNotPaused onlyClaimAdmin {
    require(userArray.length == amountArray.length, 'array length should be same');
    for (uint256 i = 0; i < userArray.length; i++) {
      require(!_claimBlacklist[userArray[i]], 'blacklisted user in batch');
      _claim(userArray[i], amountArray[i]);
    }
  }

  function adminBatchClaimAll(address[] calldata userArray) public whenNotPaused onlyClaimAdmin {
    for (uint256 i = 0; i < userArray.length; i++) {
      require(!_claimBlacklist[userArray[i]], 'blacklisted user in batch');
      _claimAll(userArray[i]);
    }
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  function renounceOwnership() public virtual override onlyOwner {
    revert('Ownable2Step: can not renounce ownership');
  }

  function getMetadata()
    external
    view
    returns (
      address _nftClaim,
      address _nftController,
      address _claimAdmin,
      address[] memory _allowanceContracts,
      uint256 _totalNftClaimed,
      bool _paused
    )
  {
    // Create a memory copy of the storage array
    address[] memory allowanceContractsCopy = new address[](_allowanceContractsArray.length);
    for (uint i = 0; i < _allowanceContractsArray.length; i++) {
      allowanceContractsCopy[i] = _allowanceContractsArray[i];
    }

    return (
      address(this),
      nftControllerAddress,
      claimAdminAddress,
      allowanceContractsCopy,
      _totalNftClaimedAllUsers,
      paused()
    );
  }
}
