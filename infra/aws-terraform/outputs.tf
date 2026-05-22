output "api_gateway_public_ip" {
  value       = aws_instance.api_gateway.public_ip
  description = "The public IP of the API Gateway server. Use this to hit endpoints."
}

output "python_worker_private_ip" {
  value       = aws_instance.python_worker.private_ip
  description = "The internal private IP of the Python worker."
}

output "ts_worker_private_ip" {
  value       = aws_instance.ts_worker.private_ip
  description = "The internal private IP of the TypeScript worker."
}

output "infer_curl_command" {
  value       = "curl -X POST http://${aws_instance.api_gateway.public_ip}:3000/infer -H \"Content-Type: application/json\" -d '{\"prompt\": \"Explain neural networks in one sentence\", \"max_tokens\": 80}'"
  description = "Convenience command to test the end-to-end inference execution flow."
}

output "health_curl_command" {
  value       = "curl http://${aws_instance.api_gateway.public_ip}:3000/health"
  description = "Convenience command to check the health status of the Gateway and both workers."
}

output "metrics_curl_command" {
  value       = "curl http://${aws_instance.api_gateway.public_ip}:3000/metrics"
  description = "Convenience command to view requests count and average latency metrics."
}

output "ssh_api_gateway" {
  value       = "ssh -i YOUR_PEM_FILE.pem ubuntu@${aws_instance.api_gateway.public_ip}"
  description = "Command to SSH into the API Gateway server."
}
