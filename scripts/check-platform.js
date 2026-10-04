const expectedTarget = process.argv[2];
const actualTarget = `${process.platform}-${process.arch}`;

if (!expectedTarget) {
    console.error('Usage: node scripts/check-platform.js <expected-target>');
    process.exit(2);
}

if (actualTarget !== expectedTarget) {
    console.error(`Runner target mismatch: expected ${expectedTarget}, received ${actualTarget}`);
    process.exit(1);
}

console.log(`Runner target verified: ${actualTarget}`);
