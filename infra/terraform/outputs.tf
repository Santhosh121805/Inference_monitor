##############################################################################
# Terraform Outputs – Print useful info after apply
##############################################################################

output "api_gateway_public_ip" {
  description = "Public IP of the API Gateway – use this for curl commands"
  value       = google_compute_instance.api_gateway.network_interface[0].access_config[0].nat_ip
}

output "api_gateway_private_ip" {
  description = "Private (internal) IP of the API Gateway"
  value       = google_compute_instance.api_gateway.network_interface[0].network_ip
}

output "python_worker_private_ip" {
  description = "Private IP of the Python worker (not reachable from internet)"
  value       = google_compute_instance.python_worker.network_interface[0].network_ip
}

output "ts_worker_private_ip" {
  description = "Private IP of the TypeScript worker (not reachable from internet)"
  value       = google_compute_instance.ts_worker.network_interface[0].network_ip
}

output "infer_curl_command" {
  description = "Ready-to-run curl command to test inference"
  value       = <<-EOT
    curl -X POST http://${google_compute_instance.api_gateway.network_interface[0].access_config[0].nat_ip}:3000/infer \
      -H "Content-Type: application/json" \
      -d '{"prompt": "What is machine learning?", "max_tokens": 100, "temperature": 0.7}'
  EOT
}

output "health_curl_command" {
  description = "Ready-to-run curl command to check health"
  value       = "curl http://${google_compute_instance.api_gateway.network_interface[0].access_config[0].nat_ip}:3000/health"
}

output "ssh_gateway_command" {
  description = "SSH into the API Gateway"
  value       = "ssh ${var.ssh_user}@${google_compute_instance.api_gateway.network_interface[0].access_config[0].nat_ip}"
}

output "ssh_python_worker_via_gateway" {
  description = "SSH into Python worker via gateway as jump host"
  value       = "ssh -J ${var.ssh_user}@${google_compute_instance.api_gateway.network_interface[0].access_config[0].nat_ip} ${var.ssh_user}@${google_compute_instance.python_worker.network_interface[0].network_ip}"
}

output "ssh_ts_worker_via_gateway" {
  description = "SSH into TypeScript worker via gateway as jump host"
  value       = "ssh -J ${var.ssh_user}@${google_compute_instance.api_gateway.network_interface[0].access_config[0].nat_ip} ${var.ssh_user}@${google_compute_instance.ts_worker.network_interface[0].network_ip}"
}
