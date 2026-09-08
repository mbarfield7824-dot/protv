require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { grantAdminRole } = require('../src/firebase');

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/set-admin-claim.js owner@example.com');
  process.exitCode = 1;
} else {
  grantAdminRole(email)
    .then((userRecord) => {
      console.log(`Admin role granted to ${userRecord.email} (${userRecord.uid}).`);
    })
    .catch((error) => {
      console.error(`Unable to grant admin role: ${error.message}`);
      process.exitCode = 1;
    });
}
