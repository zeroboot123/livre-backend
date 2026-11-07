import json

with open("/etc/easypanel/traefik/config/main.yaml", "r") as f:
    data = json.load(f)

# Service configurations
fixes = {
    "livre-backend_livre-backend-0": {"host": "admin-panel:3003", "prefix": "/admin", "strip": False},
    "livre-backend_livre-backend-1": {"host": "auth-service:3001", "prefix": "/auth", "strip": False},
    "livre-backend_livre-backend-2": {"host": "postgrest:3000", "prefix": "/api/rest", "strip": False},
    "livre-backend_livre-backend-3": {"host": "admin-api:3002", "prefix": "/admin/api", "strip": True},
    "livre-backend_livre-backend-4": {"host": "visual-db:3004", "prefix": "/admin/visual-db", "strip": True},
}

# Fix service URLs
for svc_key, cfg in fixes.items():
    if svc_key in data["http"]["services"]:
        servers = data["http"]["services"][svc_key]["loadBalancer"]["servers"]
        if servers:
            if cfg["strip"]:
                # Strip prefix: send to root path
                servers[0]["url"] = f"http://{cfg['host']}"
                print(f"Fixed {svc_key} -> http://{cfg['host']} (strip)")
            else:
                # Keep prefix: send with path
                servers[0]["url"] = f"http://{cfg['host']}{cfg['prefix']}"
                print(f"Fixed {svc_key} -> http://{cfg['host']}{cfg['prefix']} (keep)")

# Clean up old strip middlewares from services that don't need them
for router_name in list(data["http"]["routers"].keys()):
    for svc_key, cfg in fixes.items():
        if svc_key in router_name:
            middlewares = data["http"]["routers"][router_name].get("middlewares", [])
            strip_mid = f"strip-{svc_key}"
            if strip_mid in middlewares and not cfg["strip"]:
                middlewares.remove(strip_mid)
                data["http"]["routers"][router_name]["middlewares"] = middlewares
                print(f"Removed strip middleware from {router_name}")

# Add strip middlewares and attach to routers for services that need them
for svc_key, cfg in fixes.items():
    if cfg["strip"]:
        # Create middleware
        mid_name = f"strip-{svc_key}"
        data.setdefault("http", {}).setdefault("middlewares", {})[mid_name] = {
            "stripPrefix": {"prefixes": [cfg["prefix"]]}
        }
        # Attach to routers
        for router_name in list(data["http"]["routers"].keys()):
            if svc_key in router_name:
                middlewares = data["http"]["routers"][router_name].get("middlewares", [])
                if mid_name not in middlewares:
                    middlewares.append(mid_name)
                    data["http"]["routers"][router_name]["middlewares"] = middlewares
                    print(f"Added middleware {mid_name} to {router_name}")

# Add priority to all livre routers
for name, router in list(data["http"]["routers"].items()):
    if "livre-backend" in name:
        router["priority"] = 2
        print(f"Fixed priority for {name}")

with open("/etc/easypanel/traefik/config/main.yaml", "w") as f:
    json.dump(data, f, indent=2)

print("Config updated successfully")