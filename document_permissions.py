VALID_ROLES = {"admin", "user"}

def validate_allowed_roles(roles):
    if not isinstance(roles, list) or not roles:
        raise ValueError("At least one allowed role is required.")
    normalized = list(dict.fromkeys(str(r).strip().lower() for r in roles))
    invalid = set(normalized) - VALID_ROLES
    if invalid:
        raise ValueError(f"Invalid roles: {', '.join(sorted(invalid))}")
    return normalized

def can_access_document(document, user_role):
    role = str(user_role).lower()
    if role == "admin":
        return True
    if role not in VALID_ROLES:
        return False
    allowed = document.get("allowed_roles")
    if allowed is None:
        allowed = (document.get("metadata") or {}).get("allowed_roles", [])
    return isinstance(allowed, list) and role in [str(x).lower() for x in allowed]

def filter_accessible_documents(documents, user_role):
    return [d for d in documents if can_access_document(d, user_role)]
