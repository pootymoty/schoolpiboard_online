using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Просьбы прислать конспект занятия.
///
/// Отдельный индекс по доске не нужен: составной начинается с той же
/// колонки, и внешний ключ опирается на него.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260905180000_SummaryRequests")]
public partial class SummaryRequests : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "summary_requests",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                board_id = table.Column<long>(type: "bigint", nullable: false),
                email = table.Column<string>(type: "text", nullable: false),
                asked_by = table.Column<string>(type: "text", nullable: false),
                asked_name = table.Column<string>(type: "text", nullable: false),
                status = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                resolved_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_summary_requests", x => x.id);
                table.ForeignKey(
                    name: "FK_summary_requests_boards_board_id",
                    column: x => x.board_id,
                    principalTable: "boards",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_summary_requests_board_id_status_created_at",
            table: "summary_requests",
            columns: new[] { "board_id", "status", "created_at" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "summary_requests");
    }
}
