# The AWS region where your resources will be provisioned.
# t2.micro is 100% free-tier eligible here.
aws_region = "us-east-1"

# The EC2 instance type (t2.micro is free-tier eligible).
instance_type = "t2.micro"

# The name of the AWS SSH Key Pair you created in your AWS Console.
# Make sure you name your key pair exactly "inference-monitor-key" in AWS.
ssh_key_name = "inference-monitor-key"
