##############################################################################
# Terraform – GCP Distributed Inference Stack
#
# Creates:
#   • VPC with a single private subnet
#   • Cloud NAT + Router (private VMs can reach the internet for updates/install)
#   • Firewall rules:
#       - allow SSH from anywhere → all VMs (port 22)
#       - allow HTTP from internet → gateway VM (port 3000)
#       - allow worker ports inside subnet only (8000, 3001)
#       - deny all other inbound to worker VMs
#   • 3 GCE e2-micro VMs (free-tier eligible):
#       python-worker  (private IP only)
#       ts-worker      (private IP only)
#       api-gateway    (public IP + private IP)
#
# Usage:
#   terraform init
#   terraform plan -var-file="terraform.tfvars"
#   terraform apply -var-file="terraform.tfvars"
##############################################################################

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

##############################################################################
# VPC Network
##############################################################################

resource "google_compute_network" "inference_vpc" {
  name                    = var.vpc_name
  auto_create_subnetworks = false
  description             = "Private VPC for distributed inference workers"
}

##############################################################################
# Private Subnet
##############################################################################

resource "google_compute_subnetwork" "inference_subnet" {
  name          = var.subnet_name
  ip_cidr_range = var.subnet_cidr
  network       = google_compute_network.inference_vpc.id
  region        = var.region
  description   = "Private subnet – workers and gateway live here"

  private_ip_google_access = true # Allows access to GCP APIs without public IP
}

##############################################################################
# Cloud Router + NAT
# Lets private VMs (no public IP) reach the internet to install packages.
##############################################################################

resource "google_compute_router" "inference_router" {
  name    = "inference-router"
  region  = var.region
  network = google_compute_network.inference_vpc.id
}

resource "google_compute_router_nat" "inference_nat" {
  name                               = "inference-nat"
  router                             = google_compute_router.inference_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = false
    filter = "ERRORS_ONLY"
  }
}

##############################################################################
# Firewall Rules
##############################################################################

# Allow SSH to all VMs from anywhere (scope down to a bastion IP in production)
resource "google_compute_firewall" "allow_ssh" {
  name    = "inference-allow-ssh"
  network = google_compute_network.inference_vpc.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["inference-vm"]
  description   = "Allow SSH from anywhere – restrict to bastion in production"
}

# Allow external HTTP traffic to the gateway only
resource "google_compute_firewall" "allow_gateway_http" {
  name    = "inference-allow-gateway-http"
  network = google_compute_network.inference_vpc.id

  allow {
    protocol = "tcp"
    ports    = [tostring(var.gateway_port)]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["api-gateway"]
  description   = "Allow public HTTP traffic to API Gateway on port ${var.gateway_port}"
}

# Allow internal subnet traffic between all VMs (workers + gateway)
resource "google_compute_firewall" "allow_internal" {
  name    = "inference-allow-internal"
  network = google_compute_network.inference_vpc.id

  allow {
    protocol = "tcp"
    ports    = [
      tostring(var.python_worker_port), # 8000 – Python worker
      tostring(var.ts_worker_port),     # 3001 – TypeScript worker
      "8080",                           # health checks
    ]
  }

  source_ranges = [var.subnet_cidr] # Only internal subnet traffic
  target_tags   = ["worker-vm", "api-gateway"]
  description   = "Allow RPC between workers and gateway inside private subnet only"
}

# Allow ICMP (ping) inside subnet for debugging
resource "google_compute_firewall" "allow_icmp_internal" {
  name    = "inference-allow-icmp-internal"
  network = google_compute_network.inference_vpc.id

  allow {
    protocol = "icmp"
  }

  source_ranges = [var.subnet_cidr]
  description   = "Allow ICMP inside subnet for connectivity testing"
}

##############################################################################
# SSH Key Metadata (attached to all instances)
##############################################################################

locals {
  ssh_key_metadata = "${var.ssh_user}:${file(var.ssh_public_key_path)}"
}

##############################################################################
# Python Worker VM (private – no public IP)
##############################################################################

resource "google_compute_instance" "python_worker" {
  name         = "python-worker"
  machine_type = var.machine_type
  zone         = var.zone
  description  = "Runs the Python SLM inference worker on port ${var.python_worker_port}"

  tags = ["inference-vm", "worker-vm", "python-worker"]

  boot_disk {
    initialize_params {
      image = var.os_image
      size  = 20 # GB – enough for model weights
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.inference_subnet.id
    # No access_config block = no public IP
  }

  metadata = {
    ssh-keys = local.ssh_key_metadata
  }

  metadata_startup_script = file("${path.module}/startup/python-worker-startup.sh")

  service_account {
    scopes = ["https://www.googleapis.com/auth/logging.write",
              "https://www.googleapis.com/auth/monitoring.write"]
  }

  scheduling {
    preemptible       = false
    automatic_restart = true
  }
}

##############################################################################
# TypeScript Worker VM (private – no public IP)
##############################################################################

resource "google_compute_instance" "ts_worker" {
  name         = "ts-worker"
  machine_type = var.machine_type
  zone         = var.zone
  description  = "Runs the TypeScript chaining worker on port ${var.ts_worker_port}"

  tags = ["inference-vm", "worker-vm", "ts-worker"]

  boot_disk {
    initialize_params {
      image = var.os_image
      size  = 10
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.inference_subnet.id
    # No access_config block = no public IP
  }

  metadata = {
    ssh-keys                    = local.ssh_key_metadata
    # Pass Python worker's private IP so startup script can configure it
    python-worker-internal-ip   = google_compute_instance.python_worker.network_interface[0].network_ip
    python-worker-port          = tostring(var.python_worker_port)
  }

  metadata_startup_script = file("${path.module}/startup/ts-worker-startup.sh")

  service_account {
    scopes = ["https://www.googleapis.com/auth/logging.write",
              "https://www.googleapis.com/auth/monitoring.write"]
  }

  scheduling {
    preemptible       = false
    automatic_restart = true
  }

  depends_on = [google_compute_instance.python_worker]
}

##############################################################################
# API Gateway VM (public-facing)
##############################################################################

resource "google_compute_instance" "api_gateway" {
  name         = "api-gateway"
  machine_type = var.gateway_machine_type
  zone         = var.zone
  description  = "Public-facing API Gateway – the only VM with a public IP"

  tags = ["inference-vm", "api-gateway"]

  boot_disk {
    initialize_params {
      image = var.os_image
      size  = 10
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.inference_subnet.id
    access_config {
      # Ephemeral public IP – gets a public IP assigned automatically
    }
  }

  metadata = {
    ssh-keys                    = local.ssh_key_metadata
    python-worker-internal-ip   = google_compute_instance.python_worker.network_interface[0].network_ip
    ts-worker-internal-ip       = google_compute_instance.ts_worker.network_interface[0].network_ip
    python-worker-port          = tostring(var.python_worker_port)
    ts-worker-port              = tostring(var.ts_worker_port)
    gateway-port                = tostring(var.gateway_port)
  }

  metadata_startup_script = file("${path.module}/startup/gateway-startup.sh")

  service_account {
    scopes = ["https://www.googleapis.com/auth/logging.write",
              "https://www.googleapis.com/auth/monitoring.write"]
  }

  scheduling {
    preemptible       = false
    automatic_restart = true
  }

  depends_on = [
    google_compute_instance.python_worker,
    google_compute_instance.ts_worker,
  ]
}
