using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Вход через «Школу π»: номер аккаунта школы уникален среди учётных
/// записей доски, и отметки о выданном бонусе — своей таблицей.
/// Колонка external_id заведена давно и у всех пуста, поэтому
/// уникальный индекс на ней строится без помех.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20261003120000_SchoolPiLogin")]
public partial class SchoolPiLogin : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "IX_users_external_id",
            table: "users",
            column: "external_id",
            unique: true);

        migrationBuilder.CreateTable(
            name: "school_pi_bonuses",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                external_id = table.Column<string>(type: "text", nullable: false),
                user_id = table.Column<long>(type: "bigint", nullable: false),
                subscription_id = table.Column<long>(type: "bigint", nullable: true),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_school_pi_bonuses", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_school_pi_bonuses_external_id",
            table: "school_pi_bonuses",
            column: "external_id",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_school_pi_bonuses_user_id",
            table: "school_pi_bonuses",
            column: "user_id",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "school_pi_bonuses");
        migrationBuilder.DropIndex(name: "IX_users_external_id", table: "users");
    }
}
