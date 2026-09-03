using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Заказы на оплату.
///
/// Раньше о покупке знал только сервер ключей, а доска видела лишь
/// подтверждение. Из-за этого человеку нечего было показать: ни истории,
/// ни того, что заказ вообще создавался. И выбор, сделанный до оплаты —
/// начать сразу или после текущего срока, — вспомнить было неоткуда:
/// подтверждение приходит отдельным запросом и этого не содержит.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260903120000_BillingOrders")]
public partial class BillingOrders : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "billing_orders",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                invoice_id = table.Column<string>(type: "text", nullable: false),
                plan_code = table.Column<string>(type: "text", nullable: false),
                plan_name = table.Column<string>(type: "text", nullable: false),
                days = table.Column<int>(type: "integer", nullable: false),
                amount = table.Column<int>(type: "integer", nullable: false),
                auto_renew = table.Column<bool>(type: "boolean", nullable: false),
                start_now = table.Column<bool>(type: "boolean", nullable: false),
                status = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                paid_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_billing_orders", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_billing_orders_user_id_created_at",
            table: "billing_orders",
            columns: new[] { "user_id", "created_at" });

        migrationBuilder.CreateIndex(
            name: "IX_billing_orders_invoice_id",
            table: "billing_orders",
            column: "invoice_id",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "billing_orders");
    }
}
