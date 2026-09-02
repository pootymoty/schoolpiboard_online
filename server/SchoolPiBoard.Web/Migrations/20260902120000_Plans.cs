using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Тарифы и подписки.
///
/// Четыре тарифа заводятся прямо здесь: без них служба не может ответить
/// даже на вопрос «что мне доступно», а заводить их руками на сервере —
/// значит однажды поднять службу с пустой таблицей. Цены и пределы потом
/// правятся обычным UPDATE, без выкладки.
///
/// Бесплатный уровень — такая же строка, как остальные: он даёт пределы,
/// но подписки не требует. Нет действующей подписки — значит бесплатный.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260902120000_Plans")]
public partial class Plans : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "plans",
            columns: table => new
            {
                id = table.Column<int>(type: "integer", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                code = table.Column<string>(type: "text", nullable: false),
                name = table.Column<string>(type: "text", nullable: false),
                active = table.Column<bool>(type: "boolean", nullable: false),
                sort = table.Column<int>(type: "integer", nullable: false),
                price_30 = table.Column<int>(type: "integer", nullable: false),
                price_90 = table.Column<int>(type: "integer", nullable: false),
                price_180 = table.Column<int>(type: "integer", nullable: false),
                price_365 = table.Column<int>(type: "integer", nullable: false),
                max_boards = table.Column<int>(type: "integer", nullable: false),
                max_storage_bytes = table.Column<long>(type: "bigint", nullable: false),
                max_participants = table.Column<int>(type: "integer", nullable: false),
                has_library = table.Column<bool>(type: "boolean", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_plans", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "subscriptions",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                plan_id = table.Column<int>(type: "integer", nullable: false),
                kind = table.Column<string>(type: "text", nullable: false),
                starts_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ends_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                source = table.Column<string>(type: "text", nullable: false),
                invoice_id = table.Column<string>(type: "text", nullable: true),
                auto_renew = table.Column<bool>(type: "boolean", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_subscriptions", x => x.id);
                table.ForeignKey(
                    name: "FK_subscriptions_plans_plan_id",
                    column: x => x.plan_id,
                    principalTable: "plans",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_plans_code", table: "plans", column: "code", unique: true);

        // Индекс по внешнему ключу EF заводит по соглашению — в базе он
        // должен появиться вместе с таблицей, иначе модель и схема разойдутся.
        migrationBuilder.CreateIndex(
            name: "IX_subscriptions_plan_id", table: "subscriptions", column: "plan_id");

        migrationBuilder.CreateIndex(
            name: "IX_subscriptions_user_id_ends_at",
            table: "subscriptions",
            columns: new[] { "user_id", "ends_at" });

        // Повторный обратный вызов с тем же счётом не должен продлевать срок
        // дважды. Стережёт база, а не только код: два одновременных вызова
        // прошли бы проверку в коде оба.
        migrationBuilder.CreateIndex(
            name: "IX_subscriptions_invoice_id",
            table: "subscriptions",
            column: "invoice_id",
            unique: true);

        migrationBuilder.InsertData(
            table: "plans",
            columns: new[]
            {
                "code", "name", "active", "sort",
                "price_30", "price_90", "price_180", "price_365",
                "max_boards", "max_storage_bytes", "max_participants", "has_library"
            },
            values: new object[,]
            {
                { "free", "Бесплатный", true, 1, 0, 0, 0, 0, 30, 50L * 1024 * 1024, 2, false },
                { "standard", "Стандартный", true, 2, 190, 490, 950, 1690, 100, 500L * 1024 * 1024, 5, true },
                { "extended", "Расширенный", true, 3, 490, 1290, 2490, 4390, 200, 2L * 1024 * 1024 * 1024, 10, true },
                { "deep", "Углублённый", true, 4, 990, 2690, 4990, 8900, 500, 5L * 1024 * 1024 * 1024, 20, true }
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "subscriptions");
        migrationBuilder.DropTable(name: "plans");
    }
}
