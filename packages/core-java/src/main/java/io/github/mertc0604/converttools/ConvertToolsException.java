package io.github.mertc0604.converttools;

import java.util.Objects;

/**
 * The only exception the core throws for invalid input or an impossible
 * calculation. Branch on {@link #code()}; the message is English developer
 * text and may change between versions. Extends
 * {@link IllegalArgumentException} so existing catch blocks keep working.
 */
public final class ConvertToolsException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    private final ErrorCode code;

    public ConvertToolsException(ErrorCode code, String message) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ConvertToolsException(
            ErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ErrorCode code() {
        return code;
    }
}
