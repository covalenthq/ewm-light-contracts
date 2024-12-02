// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract MockNonERC721Receiver {
  IERC20 public token;

  function setToken(address _token) external {
    token = IERC20(_token);
  }

  function approve(address spender, uint256 amount) external {
    require(address(token) != address(0), 'Token not set');
    require(token.approve(spender, amount), 'Approval failed');
  }

  function tryWhitelistedAllocation(
    address allowanceContract,
    uint256 nftQuantity,
    bytes32[] calldata merkleProof
  ) external {
    (bool success, ) = allowanceContract.call(
      abi.encodeWithSignature('whitelistedAllocation(uint256,bytes32[])', nftQuantity, merkleProof)
    );
    require(success, 'Call failed');
  }
}
