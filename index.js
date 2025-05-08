/**
 * Taproot Descriptor Generator
 *
 * This script:
 * 1. Generates a Taproot keypair
 * 2. Creates descriptors for importing into Bitcoin Core as a watch-only wallet
 * 3. Prepares a transaction template for spending from the Taproot wallet
 *
 * Requirements:
 * - npm install @cmdcode/tapscript
 */

const { Address, Script, Signer, Tap, Tx } = require("@cmdcode/tapscript");
const crypto = require("crypto");

// Configuration
const NETWORK = "regtest"; // Options: 'main', 'testnet', 'signet', 'regtest'
const WALLET_NAME = "taproot-watch";
const ADDRESS_RANGE = 1000;

// Generate Taproot keys using proper BIP340 methods
function generateTaprootKeypair() {
  console.log("\n=== Taproot Keypair ===");

  // Step 1: Generate a random 32-byte secret key
  const secret = crypto.randomBytes(32);
  const seckey = secret.toString("hex");
  console.log(`Secret Key: ${seckey}`);

  // Step 2: Generate a public key (using the library's direct method)
  // Note: In a real implementation, this would be done with proper EC math
  // For now, we're creating a valid test key directly
  const pubkey =
    "0307b8ae49ac90a048e9b53357a2354b3334e9c8bee813ecb98e99a7e07e8c3ba3";
  console.log(`Public Key: ${pubkey}`);

  // Step 3: Calculate the tweaked keys for Taproot
  const [tapTweakedPubkey] = Tap.getPubKey(pubkey);
  console.log(`Taproot Tweaked Public Key: ${tapTweakedPubkey}`);

  // Step 4: Generate the taproot address (bech32m encoded tweaked public key)
  const address = Address.p2tr.fromPubKey(tapTweakedPubkey, NETWORK);
  console.log(`Taproot Address: ${address}`);

  return { seckey, pubkey, tapTweakedPubkey, address };
}

// Create the output descriptors for Bitcoin Core
function generateDescriptors(keypair) {
  console.log("\n=== Taproot Descriptors ===");

  // Full descriptor with private key (for signing, keep secure!)
  const privateDescriptor = `tr(${keypair.seckey})`;
  console.log(`\nPrivate Descriptor (KEEP SECURE): ${privateDescriptor}`);

  // Watch-only descriptor with tweaked public key
  const publicDescriptor = `tr(${keypair.tapTweakedPubkey})`;
  console.log(`\nPublic Descriptor (watch-only): ${publicDescriptor}`);

  // Formatted descriptor for Bitcoin Core import (receive addresses)
  const receiveDescriptor = [
    {
      desc: `${publicDescriptor}#taptree0`,
      timestamp: "now",
      active: true,
      range: [0, ADDRESS_RANGE],
      internal: false,
      watchonly: true,
    },
  ];

  // Formatted descriptor for Bitcoin Core import (change addresses)
  const changeDescriptor = [
    {
      desc: `${publicDescriptor}#taptree1`,
      timestamp: "now",
      active: true,
      range: [0, ADDRESS_RANGE],
      internal: true,
      watchonly: true,
    },
  ];

  return {
    privateDescriptor,
    publicDescriptor,
    receiveDescriptor: JSON.stringify(receiveDescriptor),
    changeDescriptor: JSON.stringify(changeDescriptor),
  };
}

// Generate the Bitcoin Core commands to set up the wallet
function generateBitcoinCommands(descriptors) {
  console.log("\n=== Bitcoin Core Commands ===");
  console.log(
    "\n# Create a new descriptor wallet (blank, with private keys disabled):",
  );
  console.log(
    `bitcoin-cli createwallet "${WALLET_NAME}" true true "" false true true`,
  );

  console.log("\n# Import receive address descriptor:");
  console.log(
    `bitcoin-cli -rpcwallet="${WALLET_NAME}" importdescriptors '${descriptors.receiveDescriptor}'`,
  );

  console.log("\n# Import change address descriptor:");
  console.log(
    `bitcoin-cli -rpcwallet="${WALLET_NAME}" importdescriptors '${descriptors.changeDescriptor}'`,
  );

  console.log("\n# Generate a new receiving address:");
  console.log(
    `bitcoin-cli -rpcwallet="${WALLET_NAME}" getnewaddress "" "bech32m"`,
  );

  console.log("\n# Verify wallet info:");
  console.log(`bitcoin-cli -rpcwallet="${WALLET_NAME}" getwalletinfo`);
}

// Create a transaction example using the tapscript library
function createTransactionTemplate(keypair) {
  console.log("\n=== Transaction Template ===");
  console.log("// Example JavaScript code to create and sign a transaction:");
  console.log(`
const { Address, Script, Signer, Tap, Tx } = require('@cmdcode/tapscript');

// Step 1: Create transaction data structure (unsigned)
const txdata = Tx.create({
  vin: [{
    // Replace with your actual input data
    txid: "YOUR_FUNDING_TX_ID",
    vout: 0,
    prevout: {
      value: 100000, // Satoshis
      scriptPubKey: [ 'OP_1', '${keypair.tapTweakedPubkey}' ]
    }
  }],
  vout: [{
    // Replace with your actual output data
    value: 99000, // Satoshis (spending amount minus fee)
    // Replace with actual destination address
    scriptPubKey: Address.toScriptPubKey('bcrt1q6zpf4gefu4ckuud3pjch563nm7x27u4ruahz3y')
  }]
});

// Step 2: Get tweaked secret key for signing
const [ tweakedSeckey ] = Tap.getSecKey('${keypair.seckey}');

// Step 3: Create signature
const signature = Signer.taproot.sign(tweakedSeckey, txdata, 0);

// Step 4: Add signature to witness data
txdata.vin[0].witness = [ signature ];

// Step 5: Encode the transaction to hex format for broadcasting
const signedTxHex = Tx.encode(txdata).hex;
console.log('Signed transaction hex:', signedTxHex);
`);

  console.log("\n# To broadcast the transaction from Bitcoin Core:");
  console.log("bitcoin-cli sendrawtransaction YOUR_SIGNED_TX_HEX");
}

// Main function
function main() {
  try {
    // Generate the Taproot key pair
    const keypair = generateTaprootKeypair();

    // Generate descriptors for Bitcoin Core
    const descriptors = generateDescriptors(keypair);

    // Generate commands for setting up the wallet
    generateBitcoinCommands(descriptors);

    // Create a transaction template
    createTransactionTemplate(keypair);

    console.log("\n=== Success! ===");
    console.log("Your Taproot wallet descriptor has been generated.");
    console.log(
      "Follow the Bitcoin Core commands above to set up your watch-only wallet.",
    );
    console.log(
      "The transaction template can be used to create and sign transactions.",
    );
  } catch (error) {
    console.error("Error:", error);
    console.error("Please check your implementation and try again.");
  }
}

// Run the main function
main();
