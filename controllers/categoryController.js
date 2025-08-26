import { sql } from '../config/db.js';

export const getCategories = async (req, res) => {
    const { userId } = req.params;
    
    try {
        const categories = await sql `
            SELECT * FROM categories 
            WHERE user_id = ${userId} OR user_id = 'default'
            ORDER BY type, name
        `;
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const addCategory = async (req, res) => {
    const { user_id, name, type, color, icon } = req.body;
    
    try {
        const result = await sql `
            INSERT INTO categories (user_id, name, type, color, icon) 
            VALUES (${user_id}, ${name}, ${type}, ${color || '#3B82F6'}, ${icon || 'tag'}) 
            RETURNING *
        `;
        res.status(201).json(result[0]);
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
