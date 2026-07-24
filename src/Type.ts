export type TypeInternal<T> = T extends Type<infer U> ? U : never;

export type TypeInternalObject<T extends TypeObject> = {
  [K in keyof T]: TypeInternal<T[K]>;
} & {};

export type TypeObject = Record<string, Type<any>>;

export type ConstType<T> = T & { __const: true };

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type IsTuple<T> = T extends readonly any[]
  ? number extends T["length"]
    ? false
    : true
  : false;

type IsAny<T> = 0 extends 1 & T ? true : false;

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
      ? IsAny<TypeInputValue<T[K]>> extends true
        ? K
        : never
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

type ComplexObjectEntry = readonly [Type<any>, Type<any>];

type ComplexObject<T extends readonly ComplexObjectEntry[]> = {
  [E in T[number] as TypeInternal<E[0]>]: TypeInternal<E[1]>;
};

export class Type<T> {
  private matcher: (value: any) => boolean = (): boolean => true;

  private parser: (value: T, propertyName: string | null) => any = (
    value,
  ): any => value;

  private allowMissingProperty: boolean = false;

  private parse(value: any, propertyName: string | null): any {
    const isMatching = this.matcher(value);

    if (!isMatching) {
      throw new Error(Type.getValueError(propertyName));
    }

    const parsedValue = this.parser(value, propertyName) ?? null;

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

    type.parser = (value, propertyName): any => {
      if (value === null) {
        return null;
      }

      return this.parser(value, propertyName);
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

    type.parser = (value, propertyName): any => {
      if (value === null || value === undefined) {
        return null;
      }

      return this.parser(value, propertyName);
    };

    type.allowMissingProperty = true;

    return type;
  }

  public default(
    defaultValue: TypeInputValue<T> | (() => TypeInputValue<T>),
  ): Type<T | undefined> {
    const type: Type<T | undefined> = new Type();

    type.matcher = (value): boolean => {
      if (value === undefined) {
        return true;
      }

      return this.matcher(value);
    };

    type.parser = (value, propertyName): any => {
      if (value === undefined) {
        const tmpValue =
          typeof defaultValue === "function"
            ? (defaultValue as any)()
            : defaultValue;

        return this.parse(tmpValue, propertyName);
      }

      return this.parser(value, propertyName);
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

    type.parser = (tmpValue, propertyName): V => {
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

    type.parser = (value, propertyName): any[] => {
      return value.map((tmpValue, i): any => {
        const tmpPropertyName = `${propertyName ?? ""}[${i}]`;

        return elementType.parse(tmpValue, tmpPropertyName);
      });
    };

    return type;
  }

  public static object<O extends TypeObject>(
    object: O,
    options: Partial<{ ignoreUnknownProperties: boolean }> = {},
  ): Type<TypeInternalObject<O>> {
    const tmpOptions = {
      ignoreUnknownProperties: options.ignoreUnknownProperties ?? false,
    };

    const type: Type<Record<string, any>> = new Type();

    type.matcher = (value): boolean => {
      return (
        value !== null && !Array.isArray(value) && typeof value === "object"
      );
    };

    type.parser = (value, propertyName): Record<string, any> => {
      const resultValue: Record<string, any> = {};

      if (!tmpOptions.ignoreUnknownProperties) {
        for (const propertyKey in value) {
          const tmpPropertyName =
            propertyName !== null
              ? `${propertyName}.${propertyKey}`
              : propertyKey;

          if (!(propertyKey in object)) {
            throw new Error(`Unknown property "${tmpPropertyName}".`);
          }
        }
      }

      for (const propertyKey in object) {
        const tmpPropertyName =
          propertyName !== null
            ? `${propertyName}.${propertyKey}`
            : propertyKey;

        const propertyValueType = object[propertyKey];
        const propertyValue = value[propertyKey];

        if (
          !(propertyKey in value) &&
          !propertyValueType.allowMissingProperty
        ) {
          throw new Error(`Missing property "${tmpPropertyName}".`);
        }

        resultValue[propertyKey] = propertyValueType.parse(
          propertyValue,
          tmpPropertyName,
        );
      }

      return resultValue;
    };

    return type as any;
  }

  public static complexObject<
    const T extends readonly (readonly [Type<any>, Type<any>])[],
  >(
    entries: T & {
      [K in keyof T]: T[K] extends readonly [
        infer S extends Type<any>,
        infer D extends Type<any>,
      ]
        ? TypeInternal<S> extends PropertyKey
          ? T[K]
          : never
        : never;
    },
    options: Partial<{ ignoreFailures: boolean }> = {},
  ): Type<Partial<ComplexObject<T>>> {
    const tmpOptions = {
      ignoreFailures: options.ignoreFailures ?? false,
    };

    const type: Type<Partial<ComplexObject<T>>> = new Type();

    type.matcher = (value): boolean => {
      return (
        value !== null && !Array.isArray(value) && typeof value === "object"
      );
    };

    type.parser = (value, propertyName): Record<string, any> => {
      const resultValue: Record<string, any> = {};

      loop: for (const propertyKey in value) {
        const propertyValue = value[propertyKey];

        const tmpPropertyName =
          propertyName !== null
            ? `${propertyName}.${propertyKey}`
            : propertyKey;

        let keyParsingPassed = false;

        for (const [propertyKeyType, propertyValueType] of entries) {
          try {
            const parsedPropertyKey = propertyKeyType.parse(
              propertyKey,
              tmpPropertyName,
            );

            keyParsingPassed = true;

            const parsedPropertyValue = propertyValueType.parse(
              propertyValue,
              tmpPropertyName,
            );

            resultValue[parsedPropertyKey] = parsedPropertyValue;

            continue loop;
          } catch (error: any) {}
        }

        if (!tmpOptions.ignoreFailures) {
          if (!keyParsingPassed) {
            throw new Error(`Invalid key "${tmpPropertyName}".`);
          }

          if (propertyValue === undefined) {
            continue;
          }

          throw new Error(Type.getValueError(tmpPropertyName));
        }
      }

      return resultValue;
    };

    return type;
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

    type.parser = (value, propertyName): any => {
      for (const tmpType of types) {
        try {
          return tmpType.parse(value, propertyName);
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

    type.parser = (value, propertyName): any[] => {
      return types.map((tmpType, i): any => {
        const tmpValue = value[i];

        const tmpPropertyName = `${propertyName ?? ""}[${i}]`;

        return tmpType.parse(tmpValue, tmpPropertyName);
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

    type.parser = (value, propertyName): any => {
      const tmpType = callback();

      return tmpType.parser(value, propertyName);
    };

    return type as any;
  }

  public static parse<T extends Type<any>>(
    type: T,
    value: TypeInput<T>,
  ): TypeOutput<T> {
    return type.parse(value, null);
  }

  private static getValueError(propertyName: string | null): string {
    return (
      "Invalid value" +
      (propertyName !== null ? ` for "${propertyName}".` : ".")
    );
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

  public static readonly Any = Type.match<any>((value): boolean => true);

  public static readonly Object = Type.match<Record<string, any>>(
    (value): boolean =>
      value !== null && typeof value === "object" && !Array.isArray(value),
  );

  public static readonly Null = Type.match<null>(
    (value): boolean => value === null,
  );

  public static readonly BigInt = Type.match<bigint>(
    (value): boolean => typeof value === "bigint",
  );
}
