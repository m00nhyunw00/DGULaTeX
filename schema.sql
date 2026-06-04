-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: dgu_latex
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `entry`
--

DROP TABLE IF EXISTS `entry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entry` (
  `id` binary(16) NOT NULL,
  `project_id` binary(16) DEFAULT NULL,
  `parent_id` binary(16) DEFAULT NULL,
  `is_folder` tinyint DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `current_content` longtext,
  `content_hash` binary(32) DEFAULT NULL,
  `asset_url` varchar(1024) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `parent_id` (`parent_id`),
  CONSTRAINT `entry_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `entry_ibfk_2` FOREIGN KEY (`parent_id`) REFERENCES `entry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `history`
--

DROP TABLE IF EXISTS `history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history` (
  `version_id` binary(16) NOT NULL,
  `restore_from_ver` binary(16) DEFAULT NULL,
  `restore_file_name` varchar(255) DEFAULT NULL,
  `action_type` varchar(20) DEFAULT NULL,
  `created_at` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `project_id` binary(16) DEFAULT NULL,
  `main_file_id` binary(16) DEFAULT NULL,
  `user_id` binary(16) DEFAULT NULL,
  PRIMARY KEY (`version_id`),
  KEY `restore_from_ver` (`restore_from_ver`),
  KEY `project_id` (`project_id`),
  KEY `fk_history_user` (`user_id`),
  CONSTRAINT `fk_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `history_ibfk_1` FOREIGN KEY (`restore_from_ver`) REFERENCES `history` (`version_id`) ON DELETE CASCADE,
  CONSTRAINT `history_ibfk_2` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `history_contents`
--

DROP TABLE IF EXISTS `history_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_contents` (
  `content_id` binary(32) NOT NULL,
  `content` longtext,
  PRIMARY KEY (`content_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `history_contributor`
--

DROP TABLE IF EXISTS `history_contributor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_contributor` (
  `history_id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `entry_id` binary(16) NOT NULL,
  `edited_at` timestamp(3) NULL DEFAULT NULL,
  PRIMARY KEY (`history_id`,`user_id`,`entry_id`),
  KEY `user_id` (`user_id`),
  KEY `entry_id` (`entry_id`),
  CONSTRAINT `history_contributor_ibfk_1` FOREIGN KEY (`history_id`) REFERENCES `history` (`version_id`) ON DELETE CASCADE,
  CONSTRAINT `history_contributor_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `history_contributor_ibfk_3` FOREIGN KEY (`entry_id`) REFERENCES `entry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `history_change_operation`
--

DROP TABLE IF EXISTS `history_change_operation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_change_operation` (
  `operation_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `history_id` binary(16) NOT NULL,
  `entry_id` binary(16) NOT NULL,
  `user_id` binary(16) DEFAULT NULL,
  `user_name` varchar(255) DEFAULT NULL,
  `operation_type` enum('insert','delete') NOT NULL,
  `operation_index` int NOT NULL DEFAULT 0,
  `operation_length` int NOT NULL DEFAULT 0,
  `operation_text` longtext,
  `edited_at` timestamp(3) NULL DEFAULT NULL,
  PRIMARY KEY (`operation_id`),
  KEY `idx_history_change_operation_lookup` (`history_id`,`entry_id`,`edited_at`,`operation_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `history_change_operation_ibfk_1` FOREIGN KEY (`history_id`) REFERENCES `history` (`version_id`) ON DELETE CASCADE,
  CONSTRAINT `history_change_operation_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `history_structure`
--

DROP TABLE IF EXISTS `history_structure`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `history_structure` (
  `version_id` binary(16) NOT NULL,
  `entry_id` binary(16) NOT NULL,
  `entry_name` varchar(255) DEFAULT NULL,
  `parent_id` binary(16) DEFAULT NULL,
  `is_folder` tinyint(1) DEFAULT NULL,
  `content_id` binary(32) DEFAULT NULL,
  PRIMARY KEY (`version_id`,`entry_id`),
  KEY `content_id` (`content_id`),
  CONSTRAINT `history_structure_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `history` (`version_id`) ON DELETE CASCADE,
  CONSTRAINT `history_structure_ibfk_2` FOREIGN KEY (`content_id`) REFERENCES `history_contents` (`content_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invite_code`
--

DROP TABLE IF EXISTS `invite_code`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invite_code` (
  `invite_code` char(6) NOT NULL,
  `project_id` binary(16) NOT NULL,
  `role` enum('owner','editor','viewer') NOT NULL,
  PRIMARY KEY (`project_id`,`role`),
  UNIQUE KEY `invite_code` (`invite_code`),
  CONSTRAINT `invite_code_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `join_request`
--

DROP TABLE IF EXISTS `join_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `join_request` (
  `request_id` binary(16) NOT NULL,
  `project_id` binary(16) DEFAULT NULL,
  `user_id` binary(16) DEFAULT NULL,
  `request_role` enum('owner','editor','viewer') NOT NULL,
  `status` enum('PENDING','ACCEPTED','REJECTED') DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `project_id` (`project_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `join_request_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `join_request_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `last_edit_session`
--

DROP TABLE IF EXISTS `last_edit_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `last_edit_session` (
  `session_id` binary(16) NOT NULL,
  `project_id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `file_id` binary(16) DEFAULT NULL,
  `cursor_line` int DEFAULT '0',
  `cursor_column` int DEFAULT '0',
  `last_pdf_url` varchar(512) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `project_id` (`project_id`,`user_id`),
  KEY `user_id` (`user_id`),
  KEY `file_id` (`file_id`),
  CONSTRAINT `last_edit_session_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `last_edit_session_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `last_edit_session_ibfk_3` FOREIGN KEY (`file_id`) REFERENCES `entry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_member`
--

DROP TABLE IF EXISTS `project_member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_member` (
  `project_id` binary(16) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `role` enum('owner','editor','viewer') NOT NULL,
  `status` varchar(50) DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `current_file_id` binary(16) DEFAULT NULL,
  PRIMARY KEY (`project_id`,`user_id`),
  KEY `user_id` (`user_id`),
  KEY `current_file_id` (`current_file_id`),
  CONSTRAINT `project_member_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_member_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_member_ibfk_3` FOREIGN KEY (`current_file_id`) REFERENCES `entry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` binary(16) NOT NULL,
  `title` varchar(255) NOT NULL,
  `owner_id` binary(16) DEFAULT NULL,
  `main_file_id` binary(16) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  KEY `fk_main_file` (`main_file_id`),
  CONSTRAINT `fk_main_file` FOREIGN KEY (`main_file_id`) REFERENCES `entry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` binary(16) NOT NULL,
  `student_id` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `user_name` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-03 23:48:39
