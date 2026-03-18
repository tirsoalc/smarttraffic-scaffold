# SmartTrafficFlow

Aplicacao web para registrar, visualizar e explorar padroes de trafego urbano com dados contextuais. O foco do projeto e analise descritiva e visualizacao, sem predicao avancada.

## Objetivo
Construir uma ferramenta simples e util para apoiar analise de mobilidade urbana por horario, dia da semana, tipo de via e contexto local.

## Funcionalidades Core
- Cadastro de registros de trafego.
- Visualizacao por horario, dia da semana e tipo de via.
- Painel com estatisticas basicas e filtros avancados.
- Dashboard interativo.
- Mapa com visualizacao de vias.
- Exportacao de dados (CSV e JSON).
- Simulacao de cenarios de trafego.
- Geracao automatica de insights simples.

## Stack Tecnologica
### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS
- Recharts
- Leaflet

### Backend
- Java 21
- Spring Boot 3
- Spring Web
- Spring Data JPA
- Bean Validation
- PostgreSQL
- Flyway
- springdoc-openapi (Swagger)

### Qualidade e Testes
- Maven
- JUnit 5
- Spring Boot Test
- Testcontainers

## Arquitetura (visao geral)
- `frontend/`: interface web, graficos, filtros e mapa.
- `backend/`: API REST, processamento, persistencia e agregacoes.
- Camadas backend: `controller -> service -> repository -> database`.

## API REST (MVP/Core)
Base path: `/api`

- `POST /api/traffic-records`
- `GET /api/traffic-records`
- `GET /api/traffic-stats?groupBy=hour|weekday|roadType`
- `GET /api/traffic-insights`
- `POST /api/simulations/generate`
- `GET /api/traffic-map`
- `GET /api/exports?format=csv|json`

## Modelo de Dados Principal
Entidade `TrafficRecord`:
- `id: UUID`
- `timestamp: OffsetDateTime`
- `roadType: String`
- `vehicleVolume: Integer`
- `eventType: String` (opcional)
- `weather: String` (opcional)
- `region: String` (opcional)

## Como Executar (backend)
### Pre-requisitos
- Java 21
- Maven 3.9+
- PostgreSQL 14+

### 1) Configurar banco
Crie um banco (exemplo):
- `smarttrafficflow`

Ajuste as variaveis no `backend/src/main/resources/application.yml`:
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `APP_CORS_ALLOWED_ORIGINS` (ex.: `http://localhost:5173,http://127.0.0.1:5173`)

### 2) Rodar API
Modo desenvolvimento (recomendado para este momento do projeto, sem exigir novas migracoes a cada ajuste de modelo):
```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

Modo padrao (com Flyway):
```bash
cd backend
mvn spring-boot:run
```

### 3) Swagger
- `http://localhost:8080/swagger-ui.html`

## Estrutura inicial do repositorio
```text
repository/
  README.md
  backend/
    pom.xml
    src/main/java/com/smarttrafficflow/backend/...
    src/main/resources/
```

## Roadmap de Entrega
1. Fundacao da API e persistencia.
2. Agregacoes e dashboard base.
3. Filtros avancados e mapa.
4. Simulacoes e insights automatizados.
5. Exportacao e refinamento final.

## Criterios de Aceite
- Endpoints core funcionando.
- Contratos de API documentados em Swagger.
- Dados persistidos e consultados no PostgreSQL.
- Estatisticas e filtros entregues no fluxo principal.
- Documentacao clara para executar e evoluir o projeto.
