# Архитектура Pe4King

## Обзор

Pe4King — инструмент для API-тестирования, генерирующий скелетные тесты из OpenAPI/Swagger спецификаций. Доступен как расширение VS Code и плагин IntelliJ IDEA.

## Философия проектирования

### Основные принципы

**1. Конвейер Parser-Generator-Renderer**

Система следует строгому трёхэтапному конвейеру, где каждый этап имеет единственную ответственность:

```
OpenAPI Spec → [Parser] → EndpointInfo[] → [Generator] → TestModel[] → [Renderer] → Output Files
```

Это разделение позволяет добавлять новые входные форматы (Parser) или выходные форматы (Renderer) без изменения основной логики.

**2. Паттерн Visitor для обхода схемы**

JSON Schema может быть глубоко вложенной с `$ref` ссылками, композициями `allOf`/`oneOf` и циклическими зависимостями. SchemaVisitor обрабатывает эту сложность:

```
SchemaVisitor.visit(schema)
  ├── Разрешение $ref ссылок
  ├── Слияние allOf/oneOf
  ├── Обнаружение циклических ссылок (max depth)
  ├── Извлечение метаданных полей
  └── Возврат плоского SchemaField[]
```

**3. Паттерн Strategy для проверок**

Разные типы полей требуют разных матчеров. AssertionStrategy выбирает подходящий матчер на основе:
- Типа поля (string, number, boolean, array, object)
- Формата (uuid, email, date-time, uri)
- Ограничений enum
- Паттернов имён (id, name, status, created_at)

**4. Abstract Factory для рендереров**

Каждый выходной формат (pytest, REST Assured, Postman) имеет свой Renderer, реализующий интерфейс BaseRenderer:

```kotlin
interface BaseRenderer {
    fun render(tests: List<TestModel>): String
    fun fileExtension(): String
    fun fileName(endpoint: EndpointInfo): String
}
```

**5. Общее ядро, платформо-специфичный UI**

Расширение VS Code (TypeScript) и плагин IntelliJ (Kotlin) используют одинаковые архитектурные паттерны, но реализуют платформо-специфичные UI. Основная логика (парсинг, генерация, рендеринг) идентична в обоих.

## Конвейер генерации тестов

### Этап 1: Парсинг

OpenApiParser принимает спецификации Swagger 2.0 и OpenAPI 3.x:

```
Вход: openapi.json / swagger.yaml
       ↓
┌──────────────────────────────────────────────────────────┐
│                    OpenApiParser                          │
├──────────────────────────────────────────────────────────┤
│  1. Определение версии (swagger: "2.0" vs openapi: "3.x")│
│  2. Извлечение server/host + basePath                     │
│  3. Для каждого path + method:                            │
│     ├── Извлечение параметров (path, query, header)      │
│     ├── Извлечение requestBody schema                     │
│     ├── Извлечение response schemas (200, 201, 400...)   │
│     └── Построение EndpointInfo                          │
│  4. Разрешение всех $ref ссылок                           │
└──────────────────────────────────────────────────────────┘
       ↓
Выход: List<EndpointInfo>
```

### Этап 2: Анализ схемы

SchemaVisitor извлекает тестируемые поля из response schemas:

```
Вход: response schema (JSON Schema)
       ↓
┌──────────────────────────────────────────────────────────┐
│                    SchemaVisitor                          │
├──────────────────────────────────────────────────────────┤
│  visit(schema, path="", depth=0)                         │
│  ├── if depth > MAX_DEPTH: return (защита от циклов)     │
│  ├── if $ref: resolve and visit(resolved)                │
│  ├── if allOf: merge all schemas, visit(merged)          │
│  ├── if oneOf/anyOf: visit first variant                 │
│  ├── if object:                                          │
│  │   └── for each property: visit(prop, path.prop)       │
│  ├── if array:                                           │
│  │   └── visit(items, path[0])                           │
│  └── collect SchemaField(path, type, format, enum, etc.) │
└──────────────────────────────────────────────────────────┘
       ↓
Выход: List<SchemaField>
```

### Этап 3: Генерация проверок

Для каждого SchemaField выбирается подходящий матчер:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Выбор матчера                                │
├───────────────┬─────────────────────────────────────────────────┤
│ Тип поля      │ Генерируемая проверка                            │
├───────────────┼─────────────────────────────────────────────────┤
│ string        │ .body("field", notNullValue())                  │
│ string + uuid │ .body("field", matchesPattern(UUID_REGEX))      │
│ string + email│ .body("field", containsString("@"))             │
│ string + enum │ .body("field", oneOf("val1", "val2", "val3"))   │
│ integer       │ .body("field", isA(Integer.class))              │
│ number        │ .body("field", isA(Number.class))               │
│ boolean       │ .body("field", isA(Boolean.class))              │
│ array         │ .body("field", notNullValue())                  │
│               │ .body("field.size()", greaterThan(0))           │
│ object        │ .body("field", notNullValue())                  │
│ nested        │ .body("parent.child", notNullValue())           │
└───────────────┴─────────────────────────────────────────────────┘
```

### Этап 4: Построение модели теста

```kotlin
data class TestModel(
    val name: String,           // "testGetUserById"
    val endpoint: EndpointInfo, // GET /users/{id}
    val assertions: List<Assertion>,
    val setup: String?,         // Опциональный setup код
    val teardown: String?       // Опциональный cleanup
)
```

### Этап 5: Рендеринг

Каждый рендерер трансформирует TestModel в целевой формат:

```
TestModel
    │
    ├──→ RestAssuredRenderer  → UserApiTest.java
    │    └── Java класс с @Test методами
    │
    ├──→ PytestRenderer       → test_user_api.py
    │    └── Python функции с pytest assertions
    │
    └──→ PostmanRenderer      → User API.postman_collection.json
         └── Postman коллекция с тестами
```

## Структура проекта

```
Pe4King/
├── src/                        # VS Code Extension
│   ├── extension.ts            # Точка входа
│   ├── generator.ts            # Оркестратор генерации тестов
│   ├── core/                   # Основные модули
│   ├── renderers/              # Рендереры выхода
│   ├── collections/            # Сохранённые запросы + Сниппеты
│   └── ui/                     # VS Code UI
│
├── idea_plugin/                # IntelliJ IDEA Plugin
│   ├── src/main/kotlin/com/pe4king/
│   │   ├── core/               # Парсер, модели
│   │   ├── eva/                # Анализатор качества тестов
│   │   ├── generator/          # Генерация тестов
│   │   ├── renderers/          # Рендереры выхода
│   │   ├── collections/        # Переменные, запросы
│   │   ├── services/           # Project service
│   │   └── ui/                 # Панели, диалоги
│   ├── src/main/resources/
│   │   └── META-INF/plugin.xml
│   ├── build.gradle.kts
│   └── settings.gradle.kts
│
├── samples/                    # Тестовые спецификации
├── docs/                       # Документация
├── package.json                # VS Code конфигурация
└── CHANGELOG.md                # История версий
```

## Компоненты

### VS Code Extension (src/)

- **Точка входа:** extension.ts
- **Основные модули:** parser, generator, schema visitor
- **Рендереры:** pytest, REST Assured, Postman
- **Коллекции:** сохранённые запросы, переменные, сниппеты
- **UI:** webview панели

### IntelliJ IDEA Plugin (idea_plugin/)

```
src/main/kotlin/com/pe4king/
├── core/
│   ├── models/
│   │   ├── EndpointInfo.kt         # Модель API endpoint
│   │   ├── HttpMethod.kt           # GET, POST, PUT, etc.
│   │   ├── OutputFormat.kt         # PYTEST, REST_ASSURED, etc.
│   │   ├── ParameterInfo.kt        # Path/query/header параметры
│   │   └── SchemaField.kt          # JSON Schema поле
│   ├── parser/
│   │   └── OpenApiParser.kt        # Swagger 2.0 + OpenAPI 3.x
│   ├── schema/
│   │   └── SchemaVisitor.kt        # Извлечение полей
│   └── ScriptRunner.kt             # GraalJS для JS тестов
│
├── eva/
│   ├── EvaModels.kt                # OracleDepth, EvaGrade, etc.
│   └── EvaAnalyzer.kt              # Парсинг и анализ тестов
│
├── generator/
│   ├── TestGenerator.kt            # Главный генератор
│   └── models/                     # Модели тестов
│
├── renderers/
│   ├── BaseRenderer.kt             # Абстрактный рендерер
│   ├── PytestRenderer.kt           # → test_*.py
│   ├── RestAssuredRenderer.kt      # → *Test.java
│   └── PostmanRenderer.kt          # → *.json
│
├── collections/
│   ├── models/
│   │   ├── ApiCollection.kt        # Модель коллекции
│   │   ├── SavedRequest.kt         # Модель запроса
│   │   ├── Variable.kt             # Модель переменной
│   │   └── TestSnippet.kt          # Тестовый сниппет
│   ├── CollectionManager.kt        # CRUD операции
│   ├── VariableManager.kt          # Разрешение переменных
│   ├── SnippetLibrary.kt           # Библиотека сниппетов
│   ├── TestRunner.kt               # Исполнитель сниппетов
│   └── ResponseData.kt             # Модель ответа
│
├── services/
│   └── Pe4KingProjectService.kt    # Главный project service
│
└── ui/
    ├── panels/
    │   ├── MainPanel.kt            # Содержимое tool window
    │   ├── EndpointsPanel.kt       # Дерево endpoints
    │   ├── CollectionsPanel.kt     # Сохранённые запросы
    │   ├── VariablesPanel.kt       # Управление переменными
    │   ├── EvaPanel.kt             # Анализатор качества тестов
    │   ├── RequestPanel.kt         # HTTP клиент + JS тесты
    │   └── ResponseViewerPanel.kt  # Отображение ответа
    ├── components/
    │   ├── ScriptEditorPanel.kt    # Редактор JS тестов
    │   └── JsonEditorPanel.kt      # JSON с подсветкой
    └── dialogs/
        └── GenerateTestsDialog.kt  # Опции генерации
```

## Коллекции и переменные

### Иерархия коллекций

```
Workspace
└── Collection
    ├── Variables (уровень коллекции)
    ├── Folders
    │   └── Requests
    └── Requests
        ├── URL с {{variables}}
        ├── Headers
        ├── Body
        └── Tests (JS)
```

### Разрешение переменных

Переменные могут быть определены на нескольких уровнях с каскадным приоритетом:

```
1. Environment variables (высший приоритет)
   └── {{baseUrl}} = "https://prod.api.com"

2. Collection variables
   └── {{baseUrl}} = "https://staging.api.com"

3. Global variables (низший приоритет)
   └── {{baseUrl}} = "https://localhost:8080"
```

Процесс разрешения:
```
Вход: "{{baseUrl}}/users/{{userId}}"
       ↓
┌─────────────────────────────────────────┐
│          VariableManager                 │
├─────────────────────────────────────────┤
│  1. Найти все паттерны {{variable}}     │
│  2. Для каждой переменной:              │
│     ├── Проверить environment vars      │
│     ├── Проверить collection vars       │
│     └── Проверить global vars           │
│  3. Заменить на разрешённое значение    │
│  4. Предупредить если не разрешена      │
└─────────────────────────────────────────┘
       ↓
Выход: "https://prod.api.com/users/123"
```

### Тестовые сниппеты

Готовые JavaScript сниппеты для типовых проверок:

| Сниппет | Код |
|---------|-----|
| Статус 200 | `test("Status is 200", response.status === 200)` |
| Время < 500мс | `test("Fast response", response.time < 500)` |
| Есть JSON body | `test("Has body", response.body !== null)` |
| Body имеет поле | `test("Has id", response.body.id !== undefined)` |

Пользовательские сниппеты можно сохранять и использовать повторно.

### Выполнение запроса

```
┌─────────────────────────────────────────────────────────────┐
│                    TestRunner                                │
├─────────────────────────────────────────────────────────────┤
│  1. Загрузить запрос из коллекции                           │
│  2. Разрешить все {{variables}} в URL, headers, body        │
│  3. Выполнить HTTP запрос (OkHttp / fetch)                  │
│  4. Построить объект response:                              │
│     └── { status, body, headers, cookies, time }            │
│  5. Выполнить JS тесты пользователя (GraalJS / eval)        │
│  6. Собрать результаты тестов                               │
│  7. Отобразить в ResponseViewer                             │
└─────────────────────────────────────────────────────────────┘
```

## Зависимости модулей

```
                    ┌──────────────────────────┐
                    │  Pe4KingProjectService   │
                    │     (main service)       │
                    └────────────┬─────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
  │  MainPanel  │        │   Parser    │        │  Generator  │
  │   (UI)      │        │  (core)     │        │             │
  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘
         │                      │                      │
    ┌────┴────┬────┐           │                      │
    │         │    │           │                      │
    ▼         ▼    ▼           ▼                      ▼
┌───────┐┌───────┐┌───────┐┌───────┐           ┌───────────┐
│Endpts ││Collns ││Vars   ││Schema │           │ Renderers │
│Panel  ││Panel  ││Panel  ││Visitor│           │           │
└───────┘└───────┘└───────┘└───────┘           └───────────┘
    │         │                                      │
    │         │                                 ┌────┴────┐
    │         │                                 │         │
    ▼         ▼                                 ▼         ▼
┌─────────────────────┐                    ┌───────┐ ┌───────┐
│    RequestPanel     │                    │pytest │ │REST   │
│  ┌───────────────┐  │                    │       │ │Assured│
│  │ ScriptEditor  │  │                    └───────┘ └───────┘
│  │ (JS tests)    │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ScriptRunner   │  │
│  │ (GraalJS)     │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ResponseViewer │  │
│  └───────────────┘  │
└─────────────────────┘

         ┌───────────────────────┐
         │       EvaPanel        │
         │  ┌─────────────────┐  │
         │  │  EvaAnalyzer    │  │
         │  │  (parse tests)  │  │
         │  └─────────────────┘  │
         │  ┌─────────────────┐  │
         │  │  EvaModels      │  │
         │  │  (L0-L6, S-F)   │  │
         │  └─────────────────┘  │
         └───────────────────────┘
```

## Движок EVA Analysis

EVA (Evaluation of Verification Assets) — статический анализатор качества тестов без их запуска.

### Конвейер анализа

```
Вход: Тестовый файл (Java / Python)
       ↓
┌─────────────────────────────────────────────────────────────┐
│                    EvaAnalyzer                               │
├─────────────────────────────────────────────────────────────┤
│  1. Определить язык по расширению (.java / .py)             │
│  2. Найти тестовые методы:                                  │
│     ├── Java: аннотация @Test                               │
│     └── Python: def test_* или @pytest.mark                 │
│  3. Для каждого тестового метода:                           │
│     ├── Извлечь assertions (regex паттерны)                 │
│     ├── Классифицировать типы assertions                    │
│     ├── Рассчитать Oracle Depth (L0-L6)                     │
│     ├── Обнаружить анти-паттерны                            │
│     └── Рассчитать score                                    │
│  4. Агрегировать метрики на уровне файла                    │
│  5. Рассчитать общий grade (S/A/B/C/D/F)                    │
└─────────────────────────────────────────────────────────────┘
       ↓
Выход: EvaReport { tests[], summary, grade, recommendations }
```

### Уровни Oracle Depth

Измеряет, что тест реально проверяет:

```
L0 ──────────────────────────────────────────────── Score: 0
    Нет assertions вообще
    Пример: @Test void test() { api.get("/users"); }

L1 ──────────────────────────────────────────────── Score: 10
    Только status code
    Пример: .statusCode(200)

L2 ──────────────────────────────────────────────── Score: 25
    Status + response существует
    Пример: .statusCode(200)
             .body(notNullValue())

L3 ──────────────────────────────────────────────── Score: 50
    Поля верхнего уровня
    Пример: .body("id", notNullValue())
             .body("name", notNullValue())

L4 ──────────────────────────────────────────────── Score: 70
    Вложенные поля
    Пример: .body("user.email", containsString("@"))
             .body("items[0].id", notNullValue())

L5 ──────────────────────────────────────────────── Score: 85
    Типы и форматы
    Пример: .body("id", matchesPattern(UUID_REGEX))
             .body("createdAt", matchesPattern(ISO_DATE))

L6 ──────────────────────────────────────────────── Score: 100
    Валидация бизнес-логики
    Пример: .body("total", equalTo(items.stream().sum()))
             .body("status", oneOf("active", "pending"))
```

### Обнаружение анти-паттернов

| Анти-паттерн | Обнаружение | Штраф |
|--------------|-------------|-------|
| Thread.sleep() | Regex match | -10 |
| Пустой catch | `catch.*\{\s*\}` | -15 |
| Хардкод credentials | password/secret в строках | -20 |
| Copy-paste тесты | Дублирование блоков assertions | -5 каждый |
| Нет assertions | Нулевое количество assertions | Score = 0 |

### Расчёт score

```
base_score = oracle_depth_score × 0.30
           + assertion_density  × 0.25
           + negative_coverage  × 0.20
           + edge_case_coverage × 0.15
           + structural_quality × 0.10

penalties = anti_patterns × penalty_weights

final_score = max(0, base_score - penalties)

if (syntax_errors) final_score *= 0.5  // Compilation gate
```

### Пороги грейдов

| Грейд | Score | Значение |
|-------|-------|----------|
| S | 90-100 | Production-ready |
| A | 80-89 | Высокое качество |
| B | 70-79 | Хорошая основа |
| C | 60-69 | Требует доработки |
| D | 50-59 | Значительные проблемы |
| F | 0-49 | Требуется переписать |

## Поток данных

### Выполнение запроса

```
1. Пользователь выбирает endpoint в EndpointsPanel
   └── loadEndpoint() → RequestPanel

2. RequestPanel отображает:
   ├── Method + URL
   ├── Таблица Headers
   ├── Body (JSON)
   └── Tests (JS editor)

3. Пользователь нажимает Send
   ├── Разрешить переменные: {{baseUrl}} → value
   ├── Выполнить HTTP запрос (OkHttp)
   └── Получить ответ

4. ResponseViewerPanel показывает:
   ├── Pretty (JSON с подсветкой)
   ├── Raw
   ├── Headers
   └── Cookies

5. ScriptRunner выполняет JS тесты:
   ├── Построить объект response (status, body, headers, time)
   ├── Выполнить скрипт пользователя (GraalJS)
   └── Собрать результаты тестов

6. Отобразить результаты тестов:
   ├── ✓ Status is 200
   ├── ✗ Has id field
   └── 1/2 tests passed
```

### EVA Analysis

```
1. Пользователь открывает EvaPanel
2. Нажимает "Analyze File" или "Analyze Folder"
3. EvaAnalyzer:
   ├── Определить язык (Java/Python)
   ├── Найти тестовые методы/функции
   ├── Для каждого теста:
   │   ├── Посчитать assertions
   │   ├── Определить типы assertions (statusCode, body, header)
   │   ├── Рассчитать OracleDepth (L0-L6)
   │   ├── Найти проблемы
   │   └── Рассчитать score (0-100)
   └── Рассчитать summary (avg score, grade)
4. Отобразить отчёт в EvaPanel:
   ├── Общий grade
   ├── Разбивка по файлам
   ├── Детали по тестам
   └── Рекомендации
```

## Сравнение платформ

### Паритет функций

| Функция | VS Code | IntelliJ |
|---------|---------|----------|
| Парсинг OpenAPI 3.x | ✅ | ✅ |
| Парсинг Swagger 2.0 | ✅ | ✅ |
| Вывод REST Assured | ✅ | ✅ |
| Вывод pytest | ✅ | ✅ |
| Экспорт Postman | ✅ | ✅ |
| Коллекции | ✅ | ✅ |
| Переменные | ✅ | ✅ |
| Тестовые сниппеты | ✅ | ✅ |
| JS test runner | ✅ | ✅ |
| EVA анализатор | ✅ (скрипт) | ✅ (встроенный) |
| Экспорт PDF | ❌ | ✅ |

### Технологический стек

| Компонент | VS Code | IntelliJ |
|-----------|---------|----------|
| Язык | TypeScript | Kotlin |
| UI Framework | Webview (HTML/CSS) | Swing/IntelliJ UI |
| HTTP Client | fetch API | OkHttp |
| JS Engine | Встроенный eval | GraalJS |
| JSON Parser | Встроенный JSON | Jackson |
| OpenAPI Parser | swagger-parser | swagger-parser |

### Архитектурные различия

**VS Code Extension:**
- Единая точка входа (extension.ts)
- Webview панели для UI
- Message passing между extension и webview
- Активация на определённых типах файлов

**IntelliJ Plugin:**
- Project service как singleton
- Нативные tool window панели
- Прямые вызовы методов в JVM
- Всегда доступен в IDE

## Автор

Mikhail Dyuzhev
