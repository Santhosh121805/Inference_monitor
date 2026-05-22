terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── Dynamic AMI Lookup (Canonical Ubuntu 22.04 LTS) ────────────────────────
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── VPC & Networking ───────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "inference-monitor-vpc"
  }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "inference-monitor-igw"
  }
}

# Single public subnet to save on costly NAT Gateways.
# Access control is fully enforced via AWS Security Groups (Firewalls)!
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "${var.aws_region}a"

  tags = {
    Name = "inference-monitor-subnet"
  }
}

resource "aws_route_table" "rt" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = {
    Name = "inference-monitor-rt"
  }
}

resource "aws_route_table_association" "rta" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.rt.id
}

# ── Security Groups (Virtual Firewalls) ────────────────────────────────────

# 1. API Gateway SG (Accepts public HTTP on port 3000 and SSH)
resource "aws_security_group" "gateway_sg" {
  name        = "api-gateway-sg"
  description = "Allow public HTTP on port 3000 and SSH"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Public HTTP Port 3000"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Can narrow this down to your public IP
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "gateway-sg"
  }
}

# 2. TypeScript Worker SG (Only allows traffic from API Gateway on 3001)
resource "aws_security_group" "ts_worker_sg" {
  name        = "ts-worker-sg"
  description = "Allow private traffic only from API Gateway SG"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "TS Worker port from Gateway"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway_sg.id]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ts-worker-sg"
  }
}

# 3. Python Worker SG (Only allows traffic from TypeScript Worker on 8000)
resource "aws_security_group" "python_worker_sg" {
  name        = "python-worker-sg"
  description = "Allow private traffic only from TS Worker SG"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Python Worker port from TS Worker"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.ts_worker_sg.id]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "python-worker-sg"
  }
}

# ── EC2 Virtual Machines ───────────────────────────────────────────────────

# 1. Python Worker
resource "aws_instance" "python_worker" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.python_worker_sg.id]

  # Provision using the standard startup script
  user_data = file("../terraform/startup/python-worker-startup.sh")

  tags = {
    Name = "python-worker"
  }
}

# 2. TypeScript Worker
resource "aws_instance" "ts_worker" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ts_worker_sg.id]

  # Injects the Python worker's internal private IP as environment variable via startup script
  user_data = templatefile("templates/ts-worker-startup.tftpl", {
    python_worker_ip = aws_instance.python_worker.private_ip
  })

  tags = {
    Name = "ts-worker"
  }
}

# 3. API Gateway
resource "aws_instance" "api_gateway" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.gateway_sg.id]

  # Injects both workers' internal private IPs as environment variables via startup script
  user_data = templatefile("templates/gateway-startup.tftpl", {
    python_worker_ip = aws_instance.python_worker.private_ip
    ts_worker_ip     = aws_instance.ts_worker.private_ip
  })

  tags = {
    Name = "api-gateway"
  }
}
