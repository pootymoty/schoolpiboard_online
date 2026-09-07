using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Журнал согласий на автосписания и отметка о предупреждении.
///
/// Отдельного индекса по владельцу не нужно: составной начинается с той
/// же колонки, и внешний ключ опирается на него.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260907120000_Consents")]
public partial class Consents : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "renewal_notice_at",
            table: "subscriptions",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "consent_events",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                kind = table.Column<string>(type: "text", nullable: false),
                source = table.Column<string>(type: "text", nullable: false),
                text = table.Column<string>(type: "text", nullable: false),
                plan_code = table.Column<string>(type: "text", nullable: false),
                days = table.Column<int>(type: "integer", nullable: false),
                amount = table.Column<int>(type: "integer", nullable: false),
                ip = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_consent_events", x => x.id);
                table.ForeignKey(
                    name: "FK_consent_events_users_user_id",
                    column: x => x.user_id,
                    principalTable: "users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_consent_events_user_id_created_at",
            table: "consent_events",
            columns: new[] { "user_id", "created_at" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "consent_events");
        migrationBuilder.DropColumn(name: "renewal_notice_at", table: "subscriptions");
    }
}
