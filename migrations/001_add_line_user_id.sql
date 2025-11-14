-- Add line_user_id column to member_details table to store LINE User ID
-- Run this migration manually or via migration tool

ALTER TABLE `member_details` 
ADD COLUMN `line_user_id` varchar(255) DEFAULT NULL UNIQUE AFTER `phone_number`;

-- Create index for faster lookups by line_user_id
CREATE INDEX `idx_line_user_id` ON `member_details` (`line_user_id`);
