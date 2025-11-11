// hash_users.js
const bcrypt = require('bcrypt');

const adminUsers = [
  { username: 'admin1', role: 'admin', first_name: 'Super1', last_name: 'Admin' },
  { username: 'admin2', role: 'admin', first_name: 'Super2', last_name: 'Admin' },
  { username: 'admin3', role: 'admin', first_name: 'Super3', last_name: 'Admin' }
];

const plaintextPassword = '123456';
const saltRounds = 10;

async function hashAndPrintAdmins() {
  console.log("--- SQL INSERT Statements for Initial Admin Accounts ---");
  console.log("USE crud_db;\n");

  for (const adminUser of adminUsers) {
    const hashedPassword = await bcrypt.hash(plaintextPassword, saltRounds);

    const sql = `
INSERT INTO users (username, password, first_name, last_name, role)
VALUES ('${adminUser.username}', '${hashedPassword}', '${adminUser.first_name}', '${adminUser.last_name}', '${adminUser.role}');
    `.trim();

    console.log(sql);
  }

  console.log("\n--- **ACTION REQUIRED** ---");
  console.log("1. Run this file with: node hash_users.js");
  console.log("2. Copy the printed SQL statements and execute them in MySQL.");
  console.log("   → These will create admin accounts with username admin1/admin2/admin3 and password '123456'.");
}

hashAndPrintAdmins();
