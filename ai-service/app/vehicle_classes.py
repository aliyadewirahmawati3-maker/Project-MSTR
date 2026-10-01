"""Canonical SIGAP classes and the aliases used by RF100 vehicles v2."""

VEHICLE_CLASSES = frozenset({"car", "motorcycle", "bus", "truck"})
DATASET_CLASSES = ("car", "bus", "truck")
VEHICLE_ALIASES = {
    **{name: name for name in VEHICLE_CLASSES},
    **{name: "bus" for name in ("big bus", "small bus", "bus-l-", "bus-s-")},
    **{name: "truck" for name in ("big truck", "mid truck", "small truck", "truck-l-", "truck-m-", "truck-s-", "truck-xl-")},
}


def canonical_class(name):
    return VEHICLE_ALIASES.get(str(name).strip().lower())
