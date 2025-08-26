// Replace the existing CREATE TABLE query with these tables

async function initDB(){
    try {
        // Groups table
        await sql `CREATE TABLE IF NOT EXISTS savings_groups (
            group_id SERIAL PRIMARY KEY,
            group_name VARCHAR(100) NOT NULL,
            total_members INT NOT NULL,
            contribution_amount DECIMAL(10, 2) NOT NULL,
            frequency VARCHAR(20) DEFAULT 'weekly',
            start_date DATE NOT NULL,
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
y
        // Members table
        await sql `CREATE TABLE IF NOT EXISTS group_members (
            member_id SERIAL PRIMARY KEY,
            group_id INT REFERENCES savings_groups(group_id),
            full_name VARCHAR(100) NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            email VARCHAR(100),
            join_date DATE DEFAULT CURRENT_DATE,
            payout_position INT NOT NULL,
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Contributions table
        await sql `CREATE TABLE IF NOT EXISTS contributions (
            contribution_id SERIAL PRIMARY KEY,
            group_id INT REFERENCES savings_groups(group_id),
            member_id INT REFERENCES group_members(member_id),
            amount DECIMAL(10, 2) NOT NULL,
            week_number INT NOT NULL,
            payment_status VARCHAR(20) DEFAULT 'pending',
            payment_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Payouts table
        await sql `CREATE TABLE IF NOT EXISTS payouts (
            payout_id SERIAL PRIMARY KEY,
            group_id INT REFERENCES savings_groups(group_id),
            member_id INT REFERENCES group_members(member_id),
            amount DECIMAL(10, 2) NOT NULL,
            week_number INT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            payout_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        console.log('Database initialized');
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}