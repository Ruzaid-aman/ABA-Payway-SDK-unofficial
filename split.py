import os

input_file = "payway-openapi.yaml"
base_dir = "payway-openapi"
paths_file = os.path.join(base_dir, "paths", "ecommerce-checkout.yaml")
schemas_file = os.path.join(base_dir, "components", "schemas", "ecommerce-checkout.yaml")
webhooks_file = os.path.join(base_dir, "components", "webhooks.yaml")

os.makedirs(os.path.dirname(paths_file), exist_ok=True)
os.makedirs(os.path.dirname(schemas_file), exist_ok=True)
os.makedirs(os.path.dirname(webhooks_file), exist_ok=True)

with open(input_file, "r") as f:
    lines = f.readlines()

# Paths: 110-426 (0-indexed: 109 to 426) -> dedent 2 spaces
with open(paths_file, "w") as f:
    for line in lines[109:426]:
        if line.startswith("  "):
            f.write(line[2:])
        else:
            f.write(line)

# Webhooks: 428-457 (0-indexed: 427 to 457) -> dedent 2 spaces
with open(webhooks_file, "w") as f:
    for line in lines[427:457]:
        if line.startswith("  "):
            f.write(line[2:])
        else:
            f.write(line)

# Schemas: 460-1017 (0-indexed: 459 to 1017) -> dedent 4 spaces
# But wait, shared schemas are also in there. Let's just put all schemas in ecommerce-checkout.yaml for now,
# or we can extract shared.yaml. Since Redocly bundles, if everything is in ecommerce-checkout.yaml, 
# it's perfectly valid, and we can split shared later.
with open(schemas_file, "w") as f:
    for line in lines[459:1017]:
        if line.startswith("    "):
            f.write(line[4:])
        else:
            f.write(line)

print("Split completed successfully.")
