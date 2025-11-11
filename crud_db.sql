-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 11, 2025 at 01:12 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `crud_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `permissions`
--

CREATE TABLE `permissions` (
  `id` int(11) NOT NULL,
  `permission_key` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `permissions`
--

INSERT INTO `permissions` (`id`, `permission_key`, `description`) VALUES
(1, 'edit_own_profile', 'สิทธิ์ในการแก้ไขข้อมูลส่วนตัวของตนเอง'),
(2, 'view_member_list', 'สิทธิ์ในการดูรายชื่อ Member');

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role` varchar(20) NOT NULL,
  `permission_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `role_permissions`
--

INSERT INTO `role_permissions` (`role`, `permission_id`) VALUES
('member', 1),
('staff', 1),
('staff', 2);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `role` enum('admin','staff','member') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `first_name`, `last_name`, `role`, `created_at`) VALUES
(1, 'admin1', '$2b$10$EBiSDRO.cWBR1QJ9mgopl./L2jmyGVQsOn6DkDO.OH.hTr4pw0WyW', 'SuperAdmin1', 'Admin_Edit', 'admin', '2025-11-10 03:20:20'),
(2, 'admin2', '$2b$10$WFeaf1breDsDaSeLyPhiiepn5CzzPFkk6Z83PYkmgrwVkGXhE5kbK', 'Super2', 'Admin', 'admin', '2025-11-10 03:20:20'),
(3, 'admin3', '$2b$10$eOcNz3ewSOJCDbx5BiLmNOq2H6zfpzfIDT7vwIamDqRkCUjtVsF4q', 'Super3', 'Admin', 'admin', '2025-11-10 03:20:20'),
(4, 'member1', '$2b$10$oabiCe6F2Ffr2mO/xpgbnuZxZ4GU8nrI4zfysoY7DzFBaal.qHmnm', 'member1', 'member1', 'member', '2025-11-10 03:47:41'),
(5, 'member2', '$2b$10$jlXP05nWTM6ck54P4EJfc.gTCzPq9hkKCONf1nyf8KNhCMCjQfVC6', 'member2', 'member2', 'member', '2025-11-10 03:48:16'),
(6, 'member3', '$2b$10$lOKxMKvMunagIOpv.fIB5u.TSmfXRLqi93dn3YibnmGqRobz.lBfS', 'member3', 'member3', 'member', '2025-11-10 03:48:32'),
(7, 'staff1', '$2b$10$3ae/DovDIydW7PUhJO9ReewR9cGUxRXCjqS5yC1iUzTtUxSNwQCY2', 'staff1', 'staff1', 'staff', '2025-11-10 03:48:58'),
(8, 'staff2', '$2b$10$VBvvXYkNeVZ2tJ6pw9Sf/.qbCpwhXYaEGxwiZXNF.oKzDhBJuYU9G', 'staff2', 'staff2_edit', 'staff', '2025-11-10 03:49:14'),
(9, 'staff3', '$2b$10$tMuUdqwWJ8BqVxlZFaCTaeOT8LnsApn7Gek5cEHchmEu6LEpkc5IO', 'staff3_Edit', 'staff3', 'staff', '2025-11-10 03:49:26');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `permission_key` (`permission_key`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`role`,`permission_id`),
  ADD KEY `permission_id` (`permission_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
