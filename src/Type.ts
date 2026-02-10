export type TypeInternal<T> = T extends Type<infer U> ? U : never;

export type TypeInternalSchema<T extends TypeSchema> = {
  [K in keyof T]: TypeInternal<T[K]>;
} & {};

export type TypeSchema = Record<string, Type<any>>;

export type ConstType<T> = T & { __const: true };

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type IsTuple<T> = T extends readonly any[]
  ? number extends T["length"]
    ? false
    : true
  : false;

export type TypeInput<T> = T extends Type<infer U> ? TypeInputValue<U> : never;

export type TypeInputValue<T> =
  T extends ConstType<infer U>
    ? U
    : IsTuple<T> extends true
      ? { [K in keyof T]: TypeInputValue<T[K]> }
      : T extends (infer U)[]
        ? TypeInputValue<U>[]
        : T extends object
          ? TypeInputObject<T>
          : T;

export type TypeInputObject<T> = Simplify<
  {
    [K in keyof T as undefined extends TypeInputValue<T[K]>
      ? never
      : unknown extends TypeInputValue<T[K]>
        ? never
        : K]: TypeInputValue<T[K]>;
  } & {
    [K in keyof T as undefined extends TypeInputValue<T[K]>
      ? unknown extends TypeInputValue<T[K]>
        ? never
        : K
      : never]?: TypeInputValue<T[K]>;
  }
>;

export type TypeOutput<T extends Type<any>> = TypeOutputValue<TypeInternal<T>>;

export type TypeOutputValue<T> = T extends undefined
  ? TypeOutputValue<Exclude<T, undefined>>
  : T extends ConstType<infer U>
    ? U
    : IsTuple<T> extends true
      ? { [K in keyof T]: TypeOutputValue<T[K]> }
      : T extends (infer U)[]
        ? TypeOutputValue<U>[]
        : T extends object
          ? { [K in keyof T]: TypeOutputValue<T[K]> }
          : T;

type ExtendedValue<T> =
  T extends ConstType<infer U>
    ? U
    : IsTuple<T> extends true
      ? { [K in keyof T]: any }
      : T extends any[]
        ? any[]
        : T extends object
          ? Record<string, any>
          : T;

export interface ParseOptions {
  allowUnknownProperties: boolean;
}

export class Type<T> {
  private matcher: (value: any) => boolean = (): boolean => true;

  private parser: (
    value: T,
    propertyName: string | null,
    options: ParseOptions,
  ) => any = (value): any => value;

  private allowMissingProperty: boolean = false;

  private parse(
    value: any,
    propertyName: string | null,
    options: ParseOptions,
  ): any {
    const isMatching = this.matcher(value);

    if (!isMatching) {
      throw new Error(Type.getValueError(propertyName));
    }

    const parsedValue = this.parser(value, propertyName, options) ?? null;

    return parsedValue;
  }

  public extend(matcher: (value: ExtendedValue<T>) => boolean): Type<T> {
    const type: Type<T> = new Type();

    type.matcher = (value): boolean => {
      return this.matcher(value) && matcher(value);
    };

    type.parser = this.parser;

    type.allowMissingProperty = this.allowMissingProperty;

    return type;
  }

  public nullable(): Type<T | null> {
    const type: Type<T | null> = new Type();

    type.matcher = (value): boolean => {
      if (value === null) {
        return true;
      }

      return this.matcher(value);
    };

    type.parser = (value, propertyName, options): any => {
      if (value === null) {
        return null;
      }

      return this.parser(value, propertyName, options);
    };

    type.allowMissingProperty = this.allowMissingProperty;

    return type;
  }

  public optional(): Type<T | null | undefined> {
    const type: Type<T | null | undefined> = new Type();

    type.matcher = (value): boolean => {
      if (value === null || value === undefined) {
        return true;
      }

      return this.matcher(value);
    };

    type.parser = (value, propertyName, options): any => {
      if (value === null || value === undefined) {
        return null;
      }

      return this.parser(value, propertyName, options);
    };

    type.allowMissingProperty = true;

    return type;
  }

  public default(defaultValue: T | (() => T)): Type<T | undefined> {
    const type: Type<T | undefined> = new Type();

    type.matcher = (value): boolean => {
      if (value === undefined) {
        return true;
      }

      return this.matcher(value);
    };

    type.parser = (value, propertyName, options): any => {
      if (value === undefined) {
        const tmpValue =
          typeof defaultValue === "function"
            ? (defaultValue as any)()
            : defaultValue;

        return this.parse(tmpValue, propertyName, options);
      }

      return this.parser(value, propertyName, options);
    };

    type.allowMissingProperty = true;

    return type;
  }

  public static match<T>(matcher: (value: any) => boolean): Type<T> {
    const type: Type<T> = new Type();

    type.matcher = matcher;

    return type;
  }

  public static enum<const V extends readonly (string | number | boolean)[]>(
    values: V,
  ): Type<V[number]> {
    const type: Type<V[number]> = new Type();

    type.matcher = (value): boolean => {
      return values.includes(value);
    };

    return type;
  }

  public static value<const V extends string | number | boolean>(
    value: V,
  ): Type<V | undefined> {
    const type: Type<V | undefined> = new Type();

    type.matcher = (tmpValue): boolean => {
      if (tmpValue === undefined) {
        return true;
      }

      return tmpValue === value;
    };

    type.parser = (tmpValue, propertyName, options): V => {
      if (tmpValue === undefined) {
        return value;
      }

      return tmpValue;
    };

    type.allowMissingProperty = true;

    return type;
  }

  public static array<T extends Type<any>>(
    elementType: T,
  ): Type<TypeInternal<T>[]> {
    const type: Type<any[]> = new Type();

    type.matcher = (value): boolean => {
      return Array.isArray(value);
    };

    type.parser = (value, propertyName, options): any[] => {
      return value.map((tmpValue, i): any => {
        const tmpPropertyName = `${propertyName ?? ""}[${i}]`;

        return elementType.parse(tmpValue, tmpPropertyName, options);
      });
    };

    return type;
  }

  public static object<S extends TypeSchema>(
    schema: S,
  ): Type<TypeInternalSchema<S>> {
    const type: Type<Record<string, any>> = new Type();

    type.matcher = (value): boolean => {
      return (
        value !== null && !Array.isArray(value) && typeof value === "object"
      );
    };

    type.parser = (value, propertyName, options): Record<string, any> => {
      const objectValue: Record<string, any> = {};

      if (!options.allowUnknownProperties) {
        for (const key in value) {
          const tmpPropertyName =
            propertyName !== null ? `${propertyName}.${key}` : key;

          if (!(key in schema)) {
            throw new Error(this.getUnknownPropertyError(tmpPropertyName));
          }
        }
      }

      for (const key in schema) {
        const tmpPropertyName =
          propertyName !== null ? `${propertyName}.${key}` : key;

        const tmpType = schema[key];
        const tmpValue = value[key];

        if (!(key in value) && !tmpType.allowMissingProperty) {
          throw new Error(this.getMissingPropertyError(tmpPropertyName));
        }

        objectValue[key] = tmpType.parse(tmpValue, tmpPropertyName, options);
      }

      return objectValue;
    };

    return type as any;
  }

  public static union<U extends Type<any>[]>(
    types: U,
  ): Type<TypeInternal<U[number]>> {
    const type: Type<TypeInternal<U[number]>> = new Type();

    type.matcher = (value): boolean => {
      for (const tmpType of types) {
        if (tmpType.matcher(value)) {
          return true;
        }
      }

      return false;
    };

    type.parser = (value, propertyName, options): boolean => {
      for (const tmpType of types) {
        try {
          return tmpType.parse(value, propertyName, options);
        } catch {}
      }

      throw new Error(Type.getValueError(propertyName));
    };

    return type;
  }

  public static tuple<const U extends Type<any>[]>(
    types: U,
  ): Type<{ [K in keyof U]: TypeInternal<U[K]> }> {
    const type = new Type<any[]>();

    type.matcher = (value): boolean => {
      return Array.isArray(value) && value.length === types.length;
    };

    type.parser = (value, propertyName, options): any[] => {
      return types.map((tmpType, i): any => {
        const tmpValue = value[i];

        const tmpPropertyName = `${propertyName ?? ""}[${i}]`;

        return tmpType.parse(tmpValue, tmpPropertyName, options);
      });
    };

    return type as any;
  }

  public static lazy<T extends Type<any>>(callback: () => T): T {
    const type: Type<any> = new Type();

    type.matcher = (value): boolean => {
      const tmpType = callback();

      return tmpType.matcher(value);
    };

    type.parser = (value, propertyName, options): any => {
      const tmpType = callback();

      return tmpType.parser(value, propertyName, options);
    };

    return type as any;
  }

  public static parse<T extends Type<any>>(
    type: T,
    value: TypeInput<T>,
    options: Partial<ParseOptions> = {},
  ): TypeOutput<T> {
    const tmpOptions: ParseOptions = {
      allowUnknownProperties: options.allowUnknownProperties ?? false,
    };

    return type.parse(value, null, tmpOptions);
  }

  private static getValueError(propertyName: string | null): string {
    return (
      "Invalid value" +
      (propertyName !== null ? ` for "${propertyName}".` : ".")
    );
  }

  private static getUnknownPropertyError(propertyName: string): string {
    return `Unknown property "${propertyName}".`;
  }

  private static getMissingPropertyError(propertyName: string): string {
    return `Missing property "${propertyName}".`;
  }

  public static readonly String = Type.match<string>(
    (value): boolean => typeof value === "string",
  );

  public static readonly Boolean = Type.match<boolean>(
    (value): boolean => typeof value === "boolean",
  );

  public static readonly Number = Type.match<number>(
    (value): boolean => typeof value === "number",
  );

  public static readonly Integer = Type.match<number>(
    (value): boolean => typeof value === "number" && Number.isInteger(value),
  );

  public static readonly Float = Type.match<number>(
    (value): boolean => typeof value === "number" && !Number.isInteger(value),
  );

  public static readonly Date = Type.match<ConstType<Date>>(
    (value): boolean => value instanceof Date,
  );
}
