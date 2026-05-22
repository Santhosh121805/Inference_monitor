variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region to deploy resources"
}

variable "instance_type" {
  type        = string
  default     = "t2.micro" # Free tier eligible (or t3.micro in some regions)
  description = "EC2 instance type"
}

variable "ssh_key_name" {
  type        = string
  description = "Name of the pre-existing AWS SSH Key Pair to use for EC2 SSH access"
}
