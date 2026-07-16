import os

paths_file = "payway-openapi/paths/ecommerce-checkout.yaml"
with open(paths_file, "r") as f:
    content = f.read()
content = content.replace("#/components/schemas/", "../components/schemas/ecommerce-checkout.yaml#/")
with open(paths_file, "w") as f:
    f.write(content)

webhooks_file = "payway-openapi/components/webhooks.yaml"
with open(webhooks_file, "r") as f:
    content = f.read()
content = content.replace("#/components/schemas/", "./schemas/ecommerce-checkout.yaml#/")
with open(webhooks_file, "w") as f:
    f.write(content)

schemas_file = "payway-openapi/components/schemas/ecommerce-checkout.yaml"
with open(schemas_file, "r") as f:
    content = f.read()
content = content.replace("#/components/schemas/", "#/")
with open(schemas_file, "w") as f:
    f.write(content)

print("Fixes applied.")
