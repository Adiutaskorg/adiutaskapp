// ============================================
// Database Seed Script
// Creates a test user for local development
// Run: bun server/db/seed.ts
// ============================================

import { initDatabase, findOrCreateUser } from "./database";

await initDatabase();

const testUser = await findOrCreateUser({
  ssoId: "dev-user-001",
  email: "estudiante@ufv.es",
  name: "Carlos García López",
});

console.log("✅ Test user created/found:");
console.log(`   ID:    ${testUser.id}`);
console.log(`   Email: ${testUser.email}`);
console.log(`   Name:  ${testUser.name}`);
console.log("");
console.log("Use the dev-login endpoint to authenticate:");
console.log('   POST /api/auth/dev-login { "email": "estudiante@ufv.es" }');
