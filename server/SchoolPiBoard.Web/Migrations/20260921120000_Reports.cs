using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>Жалобы на доски — канал для сообщений о запрещённом содержимом.</summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260921120000_Reports")]
public partial class Reports : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "reports",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                board_id = table.Column<long>(type: "bigint", nullable: false),
                reporter_user_id = table.Column<long>(type: "bigint", nullable: true),
                reporter_guest_name = table.Column<string>(type: "text", nullable: true),
                comment = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                resolved_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_reports", x => x.id);
                table.ForeignKey(
                    name: "FK_reports_boards_board_id",
                    column: x => x.board_id,
                    principalTable: "boards",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_reports_board_id",
            table: "reports",
            column: "board_id");

        migrationBuilder.CreateIndex(
            name: "IX_reports_resolved_at_created_at",
            table: "reports",
            columns: new[] { "resolved_at", "created_at" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "reports");
    }
}
