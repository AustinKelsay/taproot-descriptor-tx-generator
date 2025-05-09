/**
 * Taproot Descriptor Generator
 *
 * This script:
 * 1. Generates a Taproot keypair
 * 2. Creates descriptors for importing into Bitcoin Core as a watch-only wallet
 * 3. Prepares an unsigned transaction and sighash for external signing
 *
 * Requirements:
 * - npm install @cmdcode/tapscript
 */

// Polyfill for globalThis.crypto in Node.js
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = require("crypto").webcrypto;
}

const { Address, Script, Signer, Tap, Tx } = require("@cmdcode/tapscript");
const crypto = require("crypto");

// Configuration
const NETWORK = "regtest"; // Options: 'main', 'testnet', 'signet', 'regtest'
const WALLET_NAME = "taproot-watch";
const ADDRESS_RANGE = 1000;

// Set your hardcoded private key here (32 bytes in hex format)
// Set to null or empty string to generate a random key
const HARDCODED_PRIVATE_KEY = ""; // hex privkey

// Generate Taproot keys using proper BIP340 methods
function generateTaprootKeypair() {
  console.log("\n=== Taproot Keypair ===");

  // Step 1: Get or generate a 32-byte secret key
  let seckey;
  if (HARDCODED_PRIVATE_KEY && HARDCODED_PRIVATE_KEY.length === 64) {
    // Use the hardcoded private key if it's provided
    seckey = HARDCODED_PRIVATE_KEY;
    console.log(`Using hardcoded private key`);
  } else {
    // Generate a random private key if none provided
    const secret = crypto.randomBytes(32);
    seckey = secret.toString("hex");
    console.log(`Generated random private key`);
  }
  console.log(`Secret Key: ${seckey}`);

  // Step 2: Use the tweak functions to derive the public key
  // First get the tweaked keys, which also gives us the untweaked pubkey
  const [tweakedSecKey, pubkey] = Tap.getSecKey(seckey);
  console.log(`Public Key: ${pubkey}`);

  // Step 3: Calculate the tweaked public key for Taproot
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

// Create an unsigned transaction and calculate the sighash for external signing
function createUnsignedTransaction(keypair) {
  console.log("\n=== Unsigned Transaction Template ===");
  
  // Sample transaction data - you would replace these values with your actual UTXO data
  const txid = "01d51794786c9bde05713a01e99ae40f09e0533976653aa765bcc036ca805c34";
  const vout = 0;
  const inputAmount = 100000; // in satoshis
  const feeAmount = 1000; // in satoshis
  const outputAmount = inputAmount - feeAmount;
  const destinationAddress = "bcrt1q6zpf4gefu4ckuud3pjch563nm7x27u4ruahz3y"; // Example destination

  // Create the transaction object
  const txdata = Tx.create({
    vin: [{
      txid: txid,
      vout: vout,
      prevout: {
        value: inputAmount,
        scriptPubKey: [ 'OP_1', keypair.tapTweakedPubkey ]
      }
    }],
    vout: [{
      value: outputAmount,
      scriptPubKey: Address.toScriptPubKey(destinationAddress)
    }]
  });

  // Encode the unsigned transaction to hex format
  const unsignedTxHex = Tx.encode(txdata).hex;
  console.log("\nUnsigned transaction hex:");
  console.log(unsignedTxHex);

  // Calculate the sighash for input 0
  const sighash = Signer.taproot.hash(txdata, 0);
  console.log("\nSighash to be signed (hex):");
  console.log(Buffer.from(sighash).toString('hex'));

  // Instructions for external signing
  console.log("\n=== External Signing Instructions ===");
  console.log("1. Use your external signer to sign the above sighash");
  console.log("2. Create the signature using the BIP340 Schnorr signing algorithm");
  console.log("3. The private key should be derived using the Taproot descriptor");
  console.log("\nOnce you have a signature, add it to the transaction witness:");
  console.log(`
// Example code for adding the signature after external signing:
// 
// const signature = "EXTERNAL_SIGNATURE_HERE";
// txdata.vin[0].witness = [ signature ];
// const signedTxHex = Tx.encode(txdata).hex;
// 
// Then broadcast with:
// bitcoin-cli sendrawtransaction signedTxHex
`);

  return {
    txdata,
    unsignedTxHex,
    sighash: Buffer.from(sighash).toString('hex')
  };
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

    // Create an unsigned transaction and sighash for external signing
    const txInfo = createUnsignedTransaction(keypair);

    console.log("\n=== Success! ===");
    console.log("Your Taproot wallet descriptor has been generated.");
    console.log("Follow the Bitcoin Core commands above to set up your watch-only wallet.");
    console.log("Use the unsigned transaction and sighash with your external signer.");
    console.log("Replace 'YOUR_FUNDING_TX_ID' with the actual txid once you've funded the address.");
  } catch (error) {
    console.error("Error:", error);
    console.error("Please check your implementation and try again.");
  }
}

// Run the main function
main();
