const { createPool } = require('mysql2/promise');
const { ensureSubmissionTables, invalidatePlatformSubmissionPool } = require('./lib/db/platform');

async function run() {
    const pool = createPool('mysql://user:pass@localhost:3306/db');

    // Intercept pool.query to count calls
    let queryCount = 0;
    const originalQuery = pool.query;
    pool.query = async function (...args) {
        queryCount++;
        if (args[0].includes('CREATE TABLE')) {
            // Simulate success
            return [[]];
        }
        return originalQuery.apply(this, args);
    };

    // Call 1
    await ensureSubmissionTables(pool);
    const count1 = queryCount;

    // Call 2
    await ensureSubmissionTables(pool);
    const count2 = queryCount;

    console.log({ count1, count2 });
    console.assert(count1 > 0, 'First call should execute CREATE TABLEs');
    console.assert(count1 === count2, 'Second call should skip CREATE TABLEs and execute 0 queries');
    console.log("Success! Caching works.");
    process.exit(0);
}

run().catch(console.error);
