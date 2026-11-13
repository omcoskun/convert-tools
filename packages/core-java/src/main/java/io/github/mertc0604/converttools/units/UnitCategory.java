package io.github.mertc0604.converttools.units;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class UnitCategory {
    private final String id;
    private final Map<String, UnitDefinition> units;
    private final List<UnitDefinition> definitions;

    public UnitCategory(String id, List<UnitDefinition> definitions) {
        this.id = Objects.requireNonNull(id, "id");
        LinkedHashMap<String, UnitDefinition> byId = new LinkedHashMap<>();
        for (UnitDefinition definition : definitions) {
            if (byId.put(definition.id(), definition) != null) {
                throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                        "Duplicate unit id: " + definition.id()
                );
            }
        }
        this.units = Collections.unmodifiableMap(byId);
        this.definitions = List.copyOf(definitions);
    }

    public String id() {
        return id;
    }

    public UnitDefinition unit(String unitId) {
        UnitDefinition unit = units.get(unitId);
        if (unit == null) {
            throw new ConvertToolsException(ErrorCode.UNKNOWN_UNIT,
                    "Unknown unit " + unitId + " in category " + id + "."
            );
        }
        return unit;
    }

    public List<UnitDefinition> units() {
        return definitions;
    }
}
