package io.github.mertc0604.converttools.units;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.github.mertc0604.converttools.units.UnitDefinition.linear;

public final class UnitCatalog {
    private static final List<UnitCategory> CATEGORY_LIST = List.of(
            createLengthCategory()
    );
    private static final Map<String, UnitCategory> CATEGORIES =
            indexCategories();

    private UnitCatalog() {
    }

    public static UnitCategory category(String categoryId) {
        UnitCategory category = CATEGORIES.get(categoryId);
        if (category == null) {
            throw new ConvertToolsException(ErrorCode.UNKNOWN_UNIT_CATEGORY,
                    "Unknown unit category: " + categoryId + "."
            );
        }
        return category;
    }

    public static List<UnitCategory> categories() {
        return CATEGORY_LIST;
    }

    private static Map<String, UnitCategory> indexCategories() {
        LinkedHashMap<String, UnitCategory> result = new LinkedHashMap<>();
        for (UnitCategory category : CATEGORY_LIST) {
            result.put(category.id(), category);
        }
        return Collections.unmodifiableMap(result);
    }

    public static UnitCategory length() {
        return category("length");
    }

    private static UnitCategory createLengthCategory() {
        return new UnitCategory("length", List.of(
                linear("millimetre", "mm", "0.001"),
                linear("centimetre", "cm", "0.01"),
                linear("metre", "m", "1"),
                linear("kilometre", "km", "1000"),
                linear("inch", "in", "0.0254"),
                linear("foot", "ft", "0.3048"),
                linear("yard", "yd", "0.9144"),
                linear("mile", "mi", "1609.344"),
                linear("nautical-mile", "NM", "1852")
        ));
    }
}
