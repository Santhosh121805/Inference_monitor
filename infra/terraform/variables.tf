##############################################################################
# Terraform Variables - GCP Distributed Inference Stack
##############################################################################

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region to deploy into"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone to deploy into"
  type        = string
  default     = "us-central1-a"
}

variable "vpc_name" {
  description = "Name of the VPC network"
  type        = string
  default     = "inference-vpc"
}

variable "subnet_name" {
  description = "Name of the private subnet"
  type        = string
  default     = "inference-subnet"
}

variable "subnet_cidr" {
  description = "CIDR block for the private subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "machine_type" {
  description = "GCE machine type for worker VMs (e2-micro is free-tier eligible)"
  type        = string
  default     = "e2-micro"
}

variable "gateway_machine_type" {
  description = "GCE machine type for the API gateway VM"
  type        = string
  default     = "e2-micro"
}

variable "os_image" {
  description = "OS image for all VMs"
  type        = string
  default     = "debian-cloud/debian-12"
}

variable "ssh_user" {
  description = "SSH username for VM access"
  type        = string
  default     = "devops"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key file for VM access"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "python_worker_port" {
  description = "Port the Python worker listens on"
  type        = number
  default     = 8000
}

variable "ts_worker_port" {
  description = "Port the TypeScript worker listens on"
  type        = number
  default     = 3001
}

variable "gateway_port" {
  description = "Port the API Gateway listens on (public)"
  type        = number
  default     = 3000
}
